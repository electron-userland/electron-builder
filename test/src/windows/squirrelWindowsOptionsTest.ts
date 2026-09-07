import { Arch, Configuration, SourceRepositoryInfo, WinPackager } from "app-builder-lib"
import { InvalidConfigurationError } from "builder-util"
import SquirrelWindowsTarget from "electron-builder-squirrel-windows/src/SquirrelWindowsTarget"
import { existsSync } from "fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"
import { TmpDir } from "temp-file"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Exercises `SquirrelWindowsTarget.computeEffectiveDistOptions` — the mapping from `squirrelWindows.*`
// config to the `InstallerOptions` handed to createWindowsInstaller — offline and on every OS. A real
// `WinPackager` is built over a minimal fake `Packager` (metadata + config), so appInfo derivations
// (`id`, `companyName`, `copyright`, `computePackageUrl`, artifact-name expansion) are the production
// ones. Only the toolset download/signing step (`prepareSignedVendorDirectory`) is stubbed.

const DEFAULT_ICON_URL = "https://raw.githubusercontent.com/szwacz/electron-boilerplate/master/resources/windows/icon.ico"
const GITHUB_REPO: SourceRepositoryInfo = { type: "github", domain: "github.com", user: "some-user", project: "some-project" }

interface Fixture {
  // `any` so the rejected legacy keys / non-boolean `msi` cases can be expressed
  readonly squirrelWindows?: Record<string, any>
  readonly config?: Configuration
  readonly metadata?: Record<string, any>
  readonly repositoryInfo?: SourceRepositoryInfo | null
  // files to create under `build/` (the buildResources dir)
  readonly buildResources?: Array<string>
}

describe("SquirrelWindowsTarget.computeEffectiveDistOptions", () => {
  let projectDir: string
  let vendorDir: string
  let tempDirManager: TmpDir
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), "eb-squirrel-options-test-"))
    vendorDir = path.join(projectDir, "vendor")
    await mkdir(vendorDir)
    tempDirManager = new TmpDir("squirrel-options-test")
    for (const name of ["GH_TOKEN", "GITHUB_TOKEN"]) {
      savedEnv[name] = process.env[name]
      delete process.env[name]
    }
  })

  afterEach(async () => {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value == null) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }
    await tempDirManager.cleanup().catch(() => {})
    await rm(projectDir, { recursive: true, force: true }).catch(() => {})
  })

  async function createTarget(fixture: Fixture = {}) {
    const buildResourcesDir = path.join(projectDir, "build")
    await mkdir(buildResourcesDir, { recursive: true })
    for (const name of fixture.buildResources ?? []) {
      await writeFile(path.join(buildResourcesDir, name), "")
    }

    // mirrors test/fixtures/test-app-one/package.json (author already normalized to an object, as Packager does)
    const metadata = {
      name: "TestApp",
      productName: "Test App ßW",
      version: "1.1.0",
      description: "Test Application",
      author: { name: "Foo Bar", email: "foo@example.com" },
      homepage: "http://foo.example.com",
      ...fixture.metadata,
    }
    const config: Configuration = {
      appId: "org.electron-builder.testApp",
      ...fixture.config,
      // the fixture apps always set iconUrl (test-app-one/package.json); tests pass `iconUrl: undefined` to unset it
      squirrelWindows: { iconUrl: DEFAULT_ICON_URL, ...fixture.squirrelWindows } as any,
    }
    const fakePackagerInfo = {
      config,
      metadata,
      devMetadata: null,
      options: {},
      projectDir,
      buildResourcesDir,
      relativeBuildResourcesDirname: "build",
      repositoryInfo: Promise.resolve(fixture.repositoryInfo ?? null),
      tempDirManager,
      framework: { defaultAppIdPrefix: "com.electron." },
    }
    const packager = new WinPackager(fakePackagerInfo as any)
    const target = new SquirrelWindowsTarget(packager, path.join(projectDir, "dist"))
    const prepareSignedVendorDirectory = vi.fn().mockResolvedValue(vendorDir)
    ;(target as any).prepareSignedVendorDirectory = prepareSignedVendorDirectory
    ;(target as any).select7zipArch = vi.fn()
    return { packager, target, prepareSignedVendorDirectory }
  }

  // Same call sequence as SquirrelWindowsTarget.build(): the setup file name is expanded by the caller
  // from the target options and handed to computeEffectiveDistOptions.
  async function compute(fixture: Fixture = {}, arch = Arch.x64) {
    const created = await createTarget(fixture)
    const { packager, target } = created
    const setupFile = packager.expandArtifactNamePattern(target.options, "exe", arch, "${productName} Setup ${version}.${ext}")
    const appOutDir = path.join(target.outDir, "win-unpacked")
    const installerOutDir = path.join(target.outDir, "squirrel-windows")
    const result = await target.computeEffectiveDistOptions(appOutDir, installerOutDir, setupFile)
    return { ...created, result, setupFile, appOutDir, installerOutDir }
  }

  test("maps the fixed fields from appInfo and the caller", async () => {
    const { result, setupFile, appOutDir, installerOutDir, prepareSignedVendorDirectory } = await compute()
    expect(result.appDirectory).toBe(appOutDir)
    expect(result.outputDirectory).toBe(installerOutDir)
    expect(result.vendorDirectory).toBe(vendorDir)
    expect(prepareSignedVendorDirectory).toHaveBeenCalledTimes(1)
    expect(result.version).toBe("1.1.0")
    expect(result.title).toBe("Test App ßW")
    expect(result.exe).toBe("Test App ßW.exe")
    expect(result.authors).toBe("Foo Bar")
    expect(result.copyright).toBe(`Copyright © ${new Date().getFullYear()} Foo Bar`)
    expect(result.description).toBe("Test Application")
    expect(result.fixUpPaths).toBe(true)
    expect(result.setupExe).toBe(setupFile)
    expect(setupFile).toBe("Test App ßW Setup 1.1.0.exe")
    expect(typeof result.createTempDir).toBe("function")
  })

  test("authors falls back to an empty string when package.json has no author", async () => {
    const { result } = await compute({ metadata: { author: undefined } })
    expect(result.authors).toBe("")
    // no company → copyright falls back to the product name
    expect(result.copyright).toBe(`Copyright © ${new Date().getFullYear()} Test App ßW`)
  })

  describe("useAppIdAsId", () => {
    test("true → nupkg id is the appId", async () => {
      const { result } = await compute({ squirrelWindows: { useAppIdAsId: true } })
      expect(result.name).toBe("org.electron-builder.testApp")
    })

    test("unset → nupkg id is the package name", async () => {
      const { result } = await compute()
      expect(result.name).toBe("TestApp")
    })

    test("false → nupkg id is the package name", async () => {
      const { result } = await compute({ squirrelWindows: { useAppIdAsId: false } })
      expect(result.name).toBe("TestApp")
    })
  })

  describe("name", () => {
    test("explicit name is used as the nupkg id", async () => {
      const { result } = await compute({ squirrelWindows: { name: "CustomName" } })
      expect(result.name).toBe("CustomName")
      // the exe keeps the product filename — appInfo.productFilename is always defined, so `name` never reaches it
      expect(result.exe).toBe("Test App ßW.exe")
    })

    test("useAppIdAsId wins over an explicit name", async () => {
      const { result } = await compute({ squirrelWindows: { name: "CustomName", useAppIdAsId: true } })
      expect(result.name).toBe("org.electron-builder.testApp")
    })

    test("explicit name is the description fallback when package.json has no description", async () => {
      const { result } = await compute({ squirrelWindows: { name: "CustomName" }, metadata: { description: "" } })
      expect(result.description).toBe("CustomName")
    })

    test("unset name → description falls back to the product name", async () => {
      const { result } = await compute({ metadata: { description: "   " } })
      expect(result.description).toBe("Test App ßW")
    })
  })

  describe("loadingGif", () => {
    test("explicit path is resolved against the project dir", async () => {
      const { result } = await compute({ squirrelWindows: { loadingGif: "build/my-spinner.gif" } })
      expect(result.loadingGif).toBe(path.resolve(projectDir, "build/my-spinner.gif"))
    })

    test("explicit absolute path is kept", async () => {
      const absolute = path.join(projectDir, "elsewhere", "spinner.gif")
      const { result } = await compute({ squirrelWindows: { loadingGif: absolute } })
      expect(result.loadingGif).toBe(absolute)
    })

    test("unset → build/install-spinner.gif wins when present", async () => {
      const { result } = await compute({ buildResources: ["install-spinner.gif"] })
      expect(result.loadingGif).toBe(path.join(projectDir, "build", "install-spinner.gif"))
    })

    test("unset and no buildResources gif → bundled default spinner", async () => {
      const { result } = await compute()
      expect(path.basename(result.loadingGif!)).toBe("install-spinner.gif")
      expect(result.loadingGif).not.toBe(path.join(projectDir, "build", "install-spinner.gif"))
      // the fallback must be shipped with electron-builder-squirrel-windows (package root, see package.json "files")
      expect(path.basename(path.dirname(result.loadingGif!))).toBe("electron-builder-squirrel-windows")
      expect(existsSync(result.loadingGif!)).toBe(true)
    })
  })

  describe("remoteReleases", () => {
    test("string URL is passed through", async () => {
      const { result } = await compute({ squirrelWindows: { remoteReleases: "https://example.com/releases" } })
      expect(result.remoteReleases).toBe("https://example.com/releases")
    })

    test("true with repository info → GitHub repository URL", async () => {
      const { result } = await compute({ squirrelWindows: { remoteReleases: true }, repositoryInfo: GITHUB_REPO })
      expect(result.remoteReleases).toBe("https://github.com/some-user/some-project")
    })

    test("true without repository info → unset (warning only)", async () => {
      const { result } = await compute({ squirrelWindows: { remoteReleases: true }, repositoryInfo: null })
      expect(result.remoteReleases).toBeUndefined()
    })

    test.each([
      ["blank string", "   "],
      ["empty string", ""],
      ["false", false],
      ["null", null],
    ])("%s → unset", async (_label, value) => {
      const { result } = await compute({ squirrelWindows: { remoteReleases: value } })
      expect(result.remoteReleases).toBeUndefined()
    })

    test("unset → unset", async () => {
      const { result } = await compute()
      expect(result.remoteReleases).toBeUndefined()
    })
  })

  describe("remoteToken", () => {
    test("explicit token wins over the environment", async () => {
      process.env.GH_TOKEN = "env-gh"
      process.env.GITHUB_TOKEN = "env-github"
      const { result } = await compute({ squirrelWindows: { remoteToken: "explicit-token" } })
      expect(result.remoteToken).toBe("explicit-token")
    })

    test("unset → GH_TOKEN", async () => {
      process.env.GH_TOKEN = "env-gh"
      process.env.GITHUB_TOKEN = "env-github"
      const { result } = await compute()
      expect(result.remoteToken).toBe("env-gh")
    })

    test("unset and no GH_TOKEN → GITHUB_TOKEN", async () => {
      process.env.GITHUB_TOKEN = "env-github"
      const { result } = await compute()
      expect(result.remoteToken).toBe("env-github")
    })

    test("unset and no token in the environment → unset", async () => {
      const { result } = await compute()
      expect(result.remoteToken).toBeUndefined()
    })

    test("null falls back to the environment", async () => {
      process.env.GITHUB_TOKEN = "env-github"
      const { result } = await compute({ squirrelWindows: { remoteToken: null } })
      expect(result.remoteToken).toBe("env-github")
    })
  })

  describe("iconUrl", () => {
    test("explicit URL is passed through", async () => {
      const { result } = await compute({ squirrelWindows: { iconUrl: "https://example.com/icon.ico" } })
      expect(result.iconUrl).toBe("https://example.com/icon.ico")
    })

    test("explicit URL is kept even when repository info is available", async () => {
      const { result } = await compute({ squirrelWindows: { iconUrl: "https://example.com/icon.ico" }, repositoryInfo: GITHUB_REPO })
      expect(result.iconUrl).toBe("https://example.com/icon.ico")
    })

    test("unset with repository info → raw GitHub URL of build/icon.ico", async () => {
      const { result } = await compute({ squirrelWindows: { iconUrl: undefined }, repositoryInfo: GITHUB_REPO })
      expect(result.iconUrl).toBe("https://github.com/some-user/some-project/blob/master/build/icon.ico?raw=true")
    })

    test("null with repository info → raw GitHub URL of build/icon.ico", async () => {
      const { result } = await compute({ squirrelWindows: { iconUrl: null }, repositoryInfo: GITHUB_REPO })
      expect(result.iconUrl).toBe("https://github.com/some-user/some-project/blob/master/build/icon.ico?raw=true")
    })

    test("unset without repository info → InvalidConfigurationError before any toolset is prepared", async () => {
      const { packager, target, prepareSignedVendorDirectory } = await createTarget({ squirrelWindows: { iconUrl: undefined }, repositoryInfo: null })
      const setupFile = packager.expandArtifactNamePattern(target.options, "exe", Arch.x64, "${productName} Setup ${version}.${ext}")
      const promise = target.computeEffectiveDistOptions(path.join(target.outDir, "win-unpacked"), path.join(target.outDir, "squirrel-windows"), setupFile)
      await expect(promise).rejects.toThrow(InvalidConfigurationError)
      await expect(promise).rejects.toThrow(/squirrelWindows\.iconUrl is not specified/)
      expect(prepareSignedVendorDirectory).not.toHaveBeenCalled()
    })
  })

  describe("msi", () => {
    test("true → msi enabled and setupMsi derived from the setup file name", async () => {
      const { result, setupFile } = await compute({ squirrelWindows: { msi: true } })
      expect(result.msi).toBe(true)
      expect(result.setupMsi).toBe("Test App ßW Setup 1.1.0.msi")
      expect(result.setupMsi).toBe(setupFile.replace(/\.exe$/, ".msi"))
    })

    test("false → msi disabled, no setupMsi", async () => {
      const { result } = await compute({ squirrelWindows: { msi: false } })
      expect(result.msi).toBe(false)
      expect(result.setupMsi).toBeUndefined()
    })

    test("unset → msi disabled, no setupMsi", async () => {
      const { result } = await compute()
      expect(result.msi).toBeUndefined()
      expect(result.setupMsi).toBeUndefined()
    })

    test('string "true" → InvalidConfigurationError', async () => {
      await expect(compute({ squirrelWindows: { msi: "true" } })).rejects.toThrow(/msi expected to be boolean value, but string '"true"' was specified/)
    })
  })

  describe("legacy electron-winstaller keys", () => {
    test.each(["outputDirectory", "appDirectory", "exe", "fixUpPaths", "usePackageJson", "extraFileSpecs", "extraMetadataSpecs", "skipUpdateIcon", "setupExe"])(
      "%s is rejected",
      async name => {
        await expect(compute({ squirrelWindows: { [name]: "value" } })).rejects.toThrow(`Option ${name} is ignored, do not specify it.`)
      }
    )
  })

  describe("artifactName", () => {
    test("squirrelWindows.artifactName wins over win.artifactName", async () => {
      const { result, setupFile } = await compute({
        // tslint:disable:no-invalid-template-strings
        squirrelWindows: { artifactName: "Squirrel-${version}.${ext}" },
        config: { win: { artifactName: "Win-${version}.${ext}" } },
      })
      expect(setupFile).toBe("Squirrel-1.1.0.exe")
      expect(result.setupExe).toBe("Squirrel-1.1.0.exe")
    })

    test("win.artifactName applies when the target-level name is unset", async () => {
      const { setupFile } = await compute({ config: { win: { artifactName: "Win-${name}-${version}.${ext}" } } })
      expect(setupFile).toBe("Win-TestApp-1.1.0.exe")
    })

    test("msi file name follows the same pattern", async () => {
      const { result } = await compute({ squirrelWindows: { artifactName: "Squirrel-${version}.${ext}", msi: true } })
      expect(result.setupExe).toBe("Squirrel-1.1.0.exe")
      expect(result.setupMsi).toBe("Squirrel-1.1.0.msi")
    })
  })

  describe("nuspec template", () => {
    test("homepage → temp template with <projectUrl> injected after <copyright>", async () => {
      const { result } = await compute()
      expect(result.nuspecTemplate).not.toBe(path.resolve(vendorDir, "..", "template.nuspectemplate"))
      const content = await readFile(result.nuspecTemplate, "utf8")
      expect(content).toContain("<copyright><%- copyright %></copyright>\n    <projectUrl>http://foo.example.com</projectUrl>")
    })

    test("no homepage but GitHub repository → repository URL as projectUrl", async () => {
      const { result } = await compute({ metadata: { homepage: undefined }, repositoryInfo: GITHUB_REPO })
      const content = await readFile(result.nuspecTemplate, "utf8")
      expect(content).toContain("<projectUrl>https://github.com/some-user/some-project</projectUrl>")
    })

    test("no homepage and no repository → stock template without projectUrl", async () => {
      const { result } = await compute({ metadata: { homepage: undefined }, repositoryInfo: null })
      expect(path.basename(result.nuspecTemplate)).toBe("template.nuspectemplate")
      expect(path.basename(path.dirname(result.nuspecTemplate))).toBe("electron-builder-squirrel-windows")
      const content = await readFile(result.nuspecTemplate, "utf8")
      expect(content).not.toContain("<projectUrl>")
    })
  })
})
