import { toEbuildVersion } from "app-builder-lib/src/targets/linux/LinuxTargetHelper"
import { classifyByHost, computeForgeRawFileUrl, computeForgeReleaseBase, detectForge, Fetcher, parseGitRemote, probeForge } from "app-builder-lib/src/util/forgeReleaseUrl"
import { toLinuxArchString } from "builder-util"
import { Arch, Platform } from "electron-builder"
import * as fs from "fs/promises"
import * as path from "path"
import { app, appThrows, EXTENDED_TIMEOUT, modifyPackageJson } from "../helpers/packTester.js"

const P = "TestApp-bin-1.1.0"
const EBUILD = `${P}.ebuild`

async function readEbuild(outDir: string): Promise<string> {
  return fs.readFile(path.join(outDir, EBUILD), "utf8")
}

function srcUri(ebuild: string): string {
  return /SRC_URI="\n([\s\S]*?)\n"/.exec(ebuild)![1]
}

/** A fetch stand-in answering only the paths given, so probing runs without a network. */
function fakeHost(answers: Record<string, { status: number; body?: string }>): Fetcher {
  return async url => {
    const answer = answers[new URL(url).pathname]
    if (answer == null) {
      throw new Error(`connection refused: ${url}`)
    }
    return { status: answer.status, text: async () => answer.body ?? "" }
  }
}

describe("gentoo", () => {
  test("semver maps onto Portage's version grammar", ({ expect }) => {
    expect(toEbuildVersion("1.1.0")).toBe("1.1.0")
    expect(toEbuildVersion("2.0")).toBe("2.0")
    expect(toEbuildVersion("1.1.0-beta.1")).toBe("1.1.0_beta1")
    expect(toEbuildVersion("1.1.0-alpha.2")).toBe("1.1.0_alpha2")
    expect(toEbuildVersion("1.1.0-rc.1")).toBe("1.1.0_rc1")
    expect(toEbuildVersion("1.1.0-pre")).toBe("1.1.0_pre")
    // build metadata has no ebuild equivalent
    expect(toEbuildVersion("1.1.0+sha.abc123")).toBe("1.1.0")
    // an unrecognised prerelease must sort BELOW the release, so _pre and never _p
    expect(toEbuildVersion("1.1.0-nightly.7")).toBe("1.1.0_pre7")
    expect(toEbuildVersion("1.1.0-canary")).toBe("1.1.0_pre")
  })

  test("architectures use Gentoo's names, not Debian's", ({ expect }) => {
    expect(toLinuxArchString(Arch.x64, "gentoo")).toBe("amd64")
    expect(toLinuxArchString(Arch.ia32, "gentoo")).toBe("x86")
    expect(toLinuxArchString(Arch.armv7l, "gentoo")).toBe("arm")
    expect(toLinuxArchString(Arch.arm64, "gentoo")).toBe("arm64")
  })
})

describe("gentoo forge detection", () => {
  test("parses every remote form package.json and git accept", ({ expect }) => {
    const expected = { host: "github.com", user: "org", project: "app" }
    expect(parseGitRemote("https://github.com/org/app")).toEqual(expected)
    expect(parseGitRemote("https://github.com/org/app.git")).toEqual(expected)
    expect(parseGitRemote("git+https://github.com/org/app.git")).toEqual(expected)
    expect(parseGitRemote("git@github.com:org/app.git")).toEqual(expected)
    expect(parseGitRemote("ssh://git@github.com/org/app.git")).toEqual(expected)
    expect(parseGitRemote("org/app")).toEqual(expected)
    expect(parseGitRemote("gitlab:org/app")).toEqual({ host: "gitlab.com", user: "org", project: "app" })
    expect(parseGitRemote("https://gitlab.com/group/sub/app")).toEqual({ host: "gitlab.com", user: "group/sub", project: "app" })
    expect(parseGitRemote("https://git.sr.ht/~user/app")).toEqual({ host: "git.sr.ht", user: "~user", project: "app" })
    expect(parseGitRemote("not a url")).toBeNull()
  })

  test("well-known hosts are recognised by name", ({ expect }) => {
    expect(classifyByHost("github.com")).toBe("github")
    expect(classifyByHost("gitlab.com")).toBe("gitlab")
    expect(classifyByHost("codeberg.org")).toBe("gitea")
    expect(classifyByHost("git.mycompany.io")).toBeNull()
  })

  test("release URLs follow each forge's own shape", ({ expect }) => {
    const remote = { host: "example.org", user: "org", project: "app" }
    expect(computeForgeReleaseBase("github", remote, "v1.0")).toBe("https://example.org/org/app/releases/download/v1.0")
    expect(computeForgeReleaseBase("gitea", remote, "v1.0")).toBe("https://example.org/org/app/releases/download/v1.0")
    expect(computeForgeReleaseBase("gitlab", remote, "v1.0")).toBe("https://example.org/org/app/-/releases/v1.0/downloads")
  })

  test("raw file URLs follow each forge's own shape", ({ expect }) => {
    const remote = { host: "example.org", user: "org", project: "app" }
    expect(computeForgeRawFileUrl("github", { ...remote, host: "github.com" }, "v1.0", "icons/app.svg")).toBe("https://raw.githubusercontent.com/org/app/v1.0/icons/app.svg")
    expect(computeForgeRawFileUrl("gitea", remote, "v1.0", "icons/app.svg")).toBe("https://example.org/org/app/raw/tag/v1.0/icons/app.svg")
    expect(computeForgeRawFileUrl("gitlab", remote, "v1.0", "icons/app.svg")).toBe("https://example.org/org/app/-/raw/v1.0/icons/app.svg")
    expect(computeForgeRawFileUrl("github", remote, "v1.0", "icons/app.svg")).toBe("https://example.org/raw/org/app/v1.0/icons/app.svg")
  })

  test("an unknown host is asked which forge it is", async ({ expect }) => {
    const gitea = fakeHost({ "/api/v1/version": { status: 200, body: '{"version":"1.22.0"}' } })
    expect(await probeForge("git.example.org", gitea)).toBe("gitea")

    const gitlab = fakeHost({ "/api/v1/version": { status: 404 }, "/api/v4/version": { status: 401 } })
    expect(await probeForge("git.example.org", gitlab)).toBe("gitlab")

    const unknown = fakeHost({})
    expect(await probeForge("git.example.org", unknown)).toBeNull()
  })

  test("an explicit hint wins, then the host name, then the probe", async ({ expect }) => {
    const gitea = fakeHost({ "/api/v1/version": { status: 200, body: '{"version":"1.22.0"}' } })
    expect((await detectForge("https://git.example.org/org/app", "gitlab", true, gitea))?.via).toBe("hint")
    expect(await detectForge("https://codeberg.org/org/app", null, true, gitea)).toMatchObject({ forge: "gitea", via: "host" })
    expect(await detectForge("https://git.example.org/org/app", null, true, gitea)).toMatchObject({ forge: "gitea", via: "probe" })
    expect(await detectForge("https://git.example.org/org/app", null, false, gitea)).toBeNull()
  })
})

describe.heavy.ifNotWindows("gentoo target", () => {
  test("emits a single self-contained ebuild referencing the published tar.gz", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.LINUX.createTarget(["gentoo", "tar.gz"], Arch.x64),
        config: {
          gentoo: {
            distUrl: "https://example.com/releases/v1.1.0",
          },
        },
      },
      {
        packed: async context => {
          const ebuild = await readEbuild(context.outDir)
          expect(ebuild.replace(/^# Copyright \d{4}/, "# Copyright <year>")).toMatchSnapshot()

          // the ebuild is the whole deliverable: no Manifest, no files/, no package directory
          const entries = await fs.readdir(context.outDir)
          expect(entries.filter(it => it === "Manifest" || it === "files" || it === "gentoo")).toEqual([])
          // default iconSource is the repository, but there is no repository here: the build warns and
          // the entry has no icon, and nothing is written to dist/ for it either
          expect(entries.some(it => it === `${P}.png` || it === `${P}.svg`)).toBe(false)
          expect(ebuild).not.toContain("newicon")
        },
      }
    )
  )

  // One ebuild has to cover every architecture, which is why the target accumulates distfiles
  // across build() calls and only emits in finishBuild(). No distUrl: the base is detected from the
  // repository field.
  test("one ebuild covers every built architecture", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.LINUX.createTarget(["gentoo", "tar.gz"], Arch.x64, Arch.arm64),
        config: {
          gentoo: {},
        },
      },
      {
        projectDirCreated: projectDir =>
          modifyPackageJson(projectDir, data => {
            data.repository = "https://github.com/example-org/example-app"
          }),
        packed: async context => {
          const ebuild = await readEbuild(context.outDir)
          expect(srcUri(ebuild)).toMatchSnapshot()
          expect(/^KEYWORDS=.*$/m.exec(ebuild)![0]).toMatchSnapshot()
          // the archive's top-level directory carries the Electron arch, so S is set per ARCH
          expect(/src_unpack\(\) \{[\s\S]*?\n\}/.exec(ebuild)![0]).toMatchSnapshot()
          // repository is on GitHub, so the icon comes straight from the repo at the tag
          expect(srcUri(ebuild)).toContain("https://raw.githubusercontent.com/example-org/example-app/v${PV}/")
          expect(ebuild).toContain("newicon")
        },
      }
    )
  )

  // Codeberg is not a host the existing repository parser knows, and it needs no probe either.
  // The checks also drops its license here: a package.json without one must still produce a
  // valid ebuild, with the fair fallback
  // And iconSource "asset" publishes the icon beside the archive
  test("derives a Codeberg release URL from the repository field alone", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.LINUX.createTarget(["gentoo", "tar.gz"], Arch.x64),
        config: {
          gentoo: {
            iconSource: "asset",
          },
        },
      },
      {
        projectDirCreated: projectDir =>
          modifyPackageJson(projectDir, data => {
            data.repository = "https://codeberg.org/example-org/example-app.git"
            delete data.license
          }),
        packed: async context => {
          const ebuild = await readEbuild(context.outDir)
          expect(srcUri(ebuild)).toContain("https://codeberg.org/example-org/example-app/releases/download/v${PV}/")
          expect(srcUri(ebuild)).toContain("/releases/download/v${PV}/${P}.png")
          expect(ebuild).toContain('LICENSE="all-rights-reserved"')
          const entries = await fs.readdir(context.outDir)
          expect(entries).toContain(`${P}.png`)
        },
      }
    )
  )

  // The format is whichever tar.* target the project already publishes; this is winboat's real config.
  // With iconSource false the archive is the only SRC_URI entry. The executableArgs, one of them
  // carrying a single quote, must reach the launcher quoted so they get to run via bash.
  test("follows the project's archive format", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.LINUX.createTarget(["gentoo", "tar.bz2"], Arch.x64),
        config: {
          linux: {
            executableArgs: ["--ozone-platform-hint=auto", "--name=it's quoted"],
          },
          gentoo: {
            distUrl: "https://example.com/releases/v1.1.0",
            iconSource: false,
          },
        },
      },
      {
        packed: async context => {
          const ebuild = await readEbuild(context.outDir)
          expect(srcUri(ebuild)).toMatchSnapshot()
          expect(srcUri(ebuild).split("\n")).toHaveLength(1)
          expect(ebuild).not.toContain("newicon")

          expect(ebuild).toContain("params+=( '--ozone-platform-hint=auto' '--name=it'\\''s quoted' )")
          expect(ebuild).toContain(`exec '/opt/Test App ßW/testapp' "\${params[@]}" "$@"`)
          expect(ebuild).toContain('newexe "${T}"/testapp testapp')
          expect(ebuild).toContain("Exec=/usr/bin/testapp %U")
        },
      }
    )
  )

  test("refuses to run without an archive target to reference", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    appThrows(
      expect,
      {
        targets: Platform.LINUX.createTarget("gentoo", Arch.x64),
        config: {
          gentoo: {
            distUrl: "https://example.com/releases/v1.1.0",
          },
        },
      },
      {},
      error => expect(error.message).toContain('"tar.gz"')
    )
  )
})
