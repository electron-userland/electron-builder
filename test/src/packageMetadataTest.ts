import { Arch, Configuration, DEFAULT_TARGET, Packager, Platform } from "app-builder-lib"
import { checkMetadata } from "app-builder-lib/internal"
import { computeArchToTargetNamesMap, resolveTargetNames } from "app-builder-lib/src/targets/targetFactory"
import { electronUpdaterRequirements } from "app-builder-lib/src/util/electronUpdaterCompatibility"
import { TmpDir } from "builder-util"
import fsExtra from "fs-extra"
import Module from "node:module"
import * as path from "path"
import { describe, expect, test, vi } from "vitest"

type CompatibilityConfig = Parameters<typeof electronUpdaterRequirements>[0]

// the minimum-version tests below declare a range that includes 6.x, so only the 4.0.0 minimum applies
// ({}: what the build has when it declares none, the default). A bare platform builds its default targets.
function checkDependencies(
  dependencies: Record<string, string>,
  projectDir: string,
  config: CompatibilityConfig = { electronUpdaterCompatibility: ">=4" },
  platforms: Array<Platform | [Platform, Array<string>]> = [Platform.WINDOWS],
  extraMetadata: Record<string, unknown> = {},
  devMetadata?: Record<string, unknown>
) {
  const metadata: any = {
    name: "test-app",
    version: "1.0.0",
    description: "test",
    author: "test",
    dependencies,
    ...extraMetadata,
  }
  const builtTargets = platforms.map(it => (Array.isArray(it) ? it : ([it, [DEFAULT_TARGET]] as const)))
  checkMetadata(metadata, devMetadata ?? metadata, "package.json", "package.json", projectDir, electronUpdaterRequirements(config, builtTargets))
}

/**
 * Creates a temp project dir. When `installedUpdaterVersion` is set, a fake installed
 * electron-updater is written to `<dir>/node_modules/electron-updater/package.json`,
 * merged with any `extraPackageJson` fields (e.g. an `exports` map).
 */
async function withProjectDir<T>(
  tmpDir: TmpDir,
  installedUpdaterVersion: string | null,
  fn: (projectDir: string) => T | Promise<T>,
  extraPackageJson: Record<string, unknown> = {}
): Promise<T> {
  const projectDir = await tmpDir.getTempDir({ prefix: "eb-package-metadata-test" })
  await fsExtra.ensureDir(projectDir)
  if (installedUpdaterVersion != null) {
    await fsExtra.outputJson(path.join(projectDir, "node_modules", "electron-updater", "package.json"), {
      name: "electron-updater",
      version: installedUpdaterVersion,
      ...extraPackageJson,
    })
  }
  // pnpm's bin shims export NODE_PATH pointing at the repo's virtual store, and require.resolve
  // consults NODE_PATH-derived global paths even when the `paths` option is set — which makes the
  // workspace electron-updater resolvable from ANY directory. Unset it for the duration of the
  // callback so the temp project dir behaves like a real user project.
  vi.stubEnv("NODE_PATH", undefined)
  ;(Module as any)._initPaths()
  try {
    return await fn(projectDir)
  } finally {
    vi.unstubAllEnvs()
    ;(Module as any)._initPaths()
  }
}

describe("checkMetadata electron-updater version validation", () => {
  describe("electron-updater not installed (declared specifier fallback)", () => {
    test("accepts pnpm catalog: specifier", async ({ tmpDir }) => {
      await withProjectDir(tmpDir, null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": "catalog:" }, projectDir)).not.toThrow()
      })
    })

    test("accepts pnpm named catalog specifier", async ({ tmpDir }) => {
      await withProjectDir(tmpDir, null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": "catalog:default" }, projectDir)).not.toThrow()
      })
    })

    test("accepts workspace: specifier", async ({ tmpDir }) => {
      await withProjectDir(tmpDir, null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": "workspace:*" }, projectDir)).not.toThrow()
      })
    })

    test("accepts yarn berry patch: specifier resolving to a satisfying version", async ({ tmpDir }) => {
      await withProjectDir(tmpDir, null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": "patch:electron-updater@npm%3A6.6.2#~/.yarn/patches/electron-updater-npm-6.6.2-abc.patch" }, projectDir)).not.toThrow()
      })
    })

    test("rejects yarn berry patch: specifier resolving to a too-old version", async ({ tmpDir }) => {
      await withProjectDir(tmpDir, null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": "patch:electron-updater@npm%3A3.0.0#~/.yarn/patches/electron-updater-npm-3.0.0-abc.patch" }, projectDir)).toThrow(
          /At least electron-updater 4\.0\.0 is recommended/
        )
      })
    })

    test("accepts semver version satisfying the minimum", async ({ tmpDir }) => {
      await withProjectDir(tmpDir, null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": "^6.2.1" }, projectDir)).not.toThrow()
      })
    })

    test("rejects too-old electron-updater version", async ({ tmpDir }) => {
      await withProjectDir(tmpDir, null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": "^3.0.0" }, projectDir)).toThrow(/At least electron-updater 4\.0\.0 is recommended/)
      })
    })
  })

  describe("electron-updater installed (resolved version validation)", () => {
    test("accepts catalog: specifier when installed version satisfies the minimum", async ({ tmpDir }) => {
      await withProjectDir(tmpDir, "6.6.0", projectDir => {
        expect(() => checkDependencies({ "electron-updater": "catalog:" }, projectDir)).not.toThrow()
      })
    })

    test("rejects catalog: specifier when installed version is too old", async ({ tmpDir }) => {
      await withProjectDir(tmpDir, "3.0.0", projectDir => {
        expect(() => checkDependencies({ "electron-updater": "catalog:" }, projectDir)).toThrow(/At least electron-updater 4\.0\.0 is recommended/)
      })
    })

    test("rejects too-old installed version even when the declared range satisfies the minimum", async ({ tmpDir }) => {
      await withProjectDir(tmpDir, "3.0.0", projectDir => {
        expect(() => checkDependencies({ "electron-updater": "^6.0.0" }, projectDir)).toThrow(/At least electron-updater 4\.0\.0 is recommended/)
      })
    })

    test("falls back to skipping catalog: validation when the installed exports map does not expose ./package.json", async ({ tmpDir }) => {
      // electron-updater 7.0.0-alpha.4 ships an exports map without "./package.json", so
      // require.resolve("electron-updater/package.json") throws ERR_PACKAGE_PATH_NOT_EXPORTED
      // and the check falls back to the declared specifier (catalog: is skipped)
      await withProjectDir(
        tmpDir,
        "3.0.0",
        projectDir => {
          expect(() => checkDependencies({ "electron-updater": "catalog:" }, projectDir)).not.toThrow()
        },
        {
          exports: {
            ".": { require: "./dist/index.js" },
            "./internal": { require: "./dist/indexInternal.js" },
          },
        }
      )
    })

    test("validates the installed version for catalog: when the exports map exposes ./package.json", async ({ tmpDir }) => {
      await withProjectDir(
        tmpDir,
        "3.0.0",
        projectDir => {
          expect(() => checkDependencies({ "electron-updater": "catalog:" }, projectDir)).toThrow(/At least electron-updater 4\.0\.0 is recommended/)
        },
        {
          exports: {
            ".": { require: "./dist/index.js" },
            "./internal": { require: "./dist/indexInternal.js" },
            "./package.json": "./package.json",
          },
        }
      )
    })
  })

  describe("electronUpdaterCompatibility", () => {
    const DEFAULT = {}

    test('the default (">=7") rejects an installed electron-updater 6.x, naming both ways out and the docs', async ({ tmpDir }) => {
      await withProjectDir(tmpDir, "6.8.10", projectDir => {
        expect(() => checkDependencies({ "electron-updater": "^6.8.10" }, projectDir, DEFAULT)).toThrow(
          /electron-updater 6\.8\.10 does not satisfy electronUpdaterCompatibility ">=7" of windows.*Upgrade electron-updater to 7, or set electronUpdaterCompatibility to a range that includes "<7".*v27-build-changes#block-map-format-follows-electronupdatercompatibility/s
        )
      })
    })

    test("the default accepts electron-updater 7 from the first release that reads the binary block map", async ({ tmpDir }) => {
      for (const version of ["7.0.0-alpha.13", "7.0.0-beta.0", "7.0.0", "7.3.1", "8.0.0-alpha.0"]) {
        await withProjectDir(tmpDir, version, projectDir => {
          expect(() => checkDependencies({ "electron-updater": `^${version}` }, projectDir, DEFAULT, [Platform.WINDOWS, Platform.MAC])).not.toThrow()
        })
      }
    })

    test("a declared range that includes the installed version accepts it", async ({ tmpDir }) => {
      await withProjectDir(tmpDir, "6.8.10", projectDir => {
        expect(() => checkDependencies({ "electron-updater": "^6.8.10" }, projectDir, { electronUpdaterCompatibility: ">=6" })).not.toThrow()
        expect(() => checkDependencies({ "electron-updater": "^6.8.10" }, projectDir, { win: { electronUpdaterCompatibility: ">=6" } })).not.toThrow()
      })
    })

    test("every built platform's range must include the installed version, not just one declared range", async ({ tmpDir }) => {
      // win builds JSON maps for electron-updater 6, but mac falls back to the root default (">=7") and writes binary maps
      const config = { win: { electronUpdaterCompatibility: ">=6" } }
      await withProjectDir(tmpDir, "6.8.10", projectDir => {
        expect(() => checkDependencies({ "electron-updater": "^6.8.10" }, projectDir, config, [Platform.WINDOWS])).not.toThrow()
        expect(() => checkDependencies({ "electron-updater": "^6.8.10" }, projectDir, config, [Platform.WINDOWS, Platform.MAC])).toThrow(
          /electron-updater 6\.8\.10 does not satisfy electronUpdaterCompatibility ">=7" of mac \(/
        )
        // a platform range overrides the root one
        expect(() =>
          checkDependencies({ "electron-updater": "^6.8.10" }, projectDir, { electronUpdaterCompatibility: ">=6", mac: { electronUpdaterCompatibility: ">=7" } }, [Platform.MAC])
        ).toThrow(/">=7" of mac/)
        // a platform the build does not target is not checked
        expect(() =>
          checkDependencies({ "electron-updater": "^6.8.10" }, projectDir, { electronUpdaterCompatibility: ">=6", linux: { electronUpdaterCompatibility: ">=7" } }, [
            Platform.WINDOWS,
          ])
        ).not.toThrow()
      })
    })

    test("the 7.0.0 prereleases before the first one that reads the binary block map are rejected where the build writes it", async ({ tmpDir }) => {
      for (const version of ["7.0.0-alpha.0", "7.0.0-alpha.12"]) {
        await withProjectDir(tmpDir, version, projectDir => {
          const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          expect(() => checkDependencies({ "electron-updater": version }, projectDir, DEFAULT, [Platform.WINDOWS, Platform.MAC, Platform.LINUX])).toThrow(
            new RegExp(
              `electron-updater ${escaped} cannot read the binary block map the build writes for windows, mac: electron-updater reads it from 7\\.0\\.0-alpha\\.13\\..*"blockmap" to "v2".*v27-build-changes#block-map-format-follows-electronupdatercompatibility`
            )
          )
          // Linux publishes no .blockmap file, and "v2" or a range that includes electron-updater 6 writes the JSON map
          expect(() => checkDependencies({ "electron-updater": version }, projectDir, DEFAULT, [Platform.LINUX])).not.toThrow()
          expect(() => checkDependencies({ "electron-updater": version }, projectDir, { blockmap: "v2" }, [Platform.WINDOWS, Platform.MAC])).not.toThrow()
          expect(() => checkDependencies({ "electron-updater": version }, projectDir, { electronUpdaterCompatibility: ">=6" }, [Platform.WINDOWS])).not.toThrow()
        })
      }
    })

    test("the binary block map floor applies only to a build with a target that publishes a .blockmap file", async ({ tmpDir }) => {
      await withProjectDir(tmpDir, "7.0.0-alpha.12", projectDir => {
        const check = (platform: Platform, targets: Array<string>) => () => checkDependencies({ "electron-updater": "^7.0.0-alpha.12" }, projectDir, DEFAULT, [[platform, targets]])
        for (const targets of [["dir"], ["portable"], ["nsis-web"], ["msi"], ["appx"], ["portable", "appx"]]) {
          expect(check(Platform.WINDOWS, targets)).not.toThrow()
        }
        // MacUpdater reads no dmg block map
        for (const targets of [["dir"], ["mas"], ["mas-dev"], ["pkg"], ["dmg"], ["pkg", "dmg"]]) {
          expect(check(Platform.MAC, targets)).not.toThrow()
        }
        expect(check(Platform.WINDOWS, ["portable", "nsis"])).toThrow(/cannot read the binary block map the build writes for windows/)
        expect(check(Platform.MAC, ["zip"])).toThrow(/cannot read the binary block map the build writes for mac/)
        expect(check(Platform.MAC, ["dmg", "zip"])).toThrow(/cannot read the binary block map the build writes for mac/)
      })
    })

    test("a declared prerelease specifier is checked at the lowest version it allows when electron-updater is not installed", async ({ tmpDir }) => {
      await withProjectDir(tmpDir, null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": "^7.0.0-alpha.5" }, projectDir, DEFAULT)).toThrow(
          /electron-updater \^7\.0\.0-alpha\.5 cannot read the binary block map/
        )
        expect(() => checkDependencies({ "electron-updater": "^7.0.0-alpha.13" }, projectDir, DEFAULT)).not.toThrow()
        expect(() => checkDependencies({ "electron-updater": "^7.0.0" }, projectDir, DEFAULT)).not.toThrow()
      })
    })

    test("a linked electron-updater checkout is held to the release floor like a release", async ({ tmpDir }) => {
      const checkout = await tmpDir.getTempDir({ prefix: "electron-updater-checkout" })
      await fsExtra.outputJson(path.join(checkout, "package.json"), { name: "electron-updater", version: "7.0.0-alpha.12" })
      const floor = /electron-updater 7\.0\.0-alpha\.12 cannot read the binary block map the build writes for windows/
      // declared as link: and not installed
      await withProjectDir(tmpDir, null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": `link:${checkout}` }, projectDir, DEFAULT)).toThrow(floor)
        expect(() => checkDependencies({ "electron-updater": `file:${checkout}` }, projectDir, DEFAULT)).toThrow(floor)
        expect(() => checkDependencies({ "electron-updater": `link:${checkout}` }, projectDir, { blockmap: "v2" })).not.toThrow()
      })
      // installed as a symlink to the checkout, as pnpm links it
      await withProjectDir(tmpDir, null, async projectDir => {
        await fsExtra.ensureDir(path.join(projectDir, "node_modules"))
        await fsExtra.symlink(checkout, path.join(projectDir, "node_modules", "electron-updater"), "junction")
        expect(() => checkDependencies({ "electron-updater": `link:${checkout}` }, projectDir, DEFAULT)).toThrow(floor)
      })
    })

    test("an electron-updater bundled from devDependencies is checked the same way", async ({ tmpDir }) => {
      await withProjectDir(tmpDir, "6.8.10", projectDir => {
        expect(() => checkDependencies({}, projectDir, DEFAULT, [Platform.WINDOWS], { devDependencies: { "electron-updater": "^6.8.10" } })).toThrow(
          /electron-updater 6\.8\.10 \(bundled from devDependencies\) does not satisfy electronUpdaterCompatibility ">=7" of windows/
        )
        // two package.json layout: the development package.json bundles it into the app
        const devMetadata = { name: "dev", devDependencies: { "electron-updater": "^6.8.10" } }
        expect(() => checkDependencies({}, projectDir, DEFAULT, [Platform.WINDOWS], {}, devMetadata)).toThrow(/\(bundled from devDependencies\) does not satisfy/)
        expect(() => checkDependencies({}, projectDir, { electronUpdaterCompatibility: ">=6" }, [Platform.WINDOWS], {}, devMetadata)).not.toThrow()
      })
      await withProjectDir(tmpDir, "3.0.0", projectDir => {
        expect(() => checkDependencies({}, projectDir, DEFAULT, [Platform.WINDOWS], { devDependencies: { "electron-updater": "^3.0.0" } })).toThrow(
          /At least electron-updater 4\.0\.0 is recommended.*Received "3\.0\.0" \(bundled from devDependencies\)/
        )
      })
    })

    test("an electron-updater in the dependencies of the development package.json is checked", async ({ tmpDir }) => {
      // two package.json layout (e.g. electron-react-boilerplate): the app's package.json lists only native modules
      const devMetadata = { name: "dev", dependencies: { "electron-updater": "^6.8.10" }, devDependencies: { "electron-updater": "^7.3.1" } }
      await withProjectDir(tmpDir, null, projectDir => {
        expect(() => checkDependencies({}, projectDir, DEFAULT, [Platform.WINDOWS], {}, devMetadata)).toThrow(
          /electron-updater \^6\.8\.10 \(bundled from dependencies of the development package\.json\) does not satisfy electronUpdaterCompatibility ">=7" of windows/
        )
        // the app's own package.json takes precedence
        expect(() => checkDependencies({}, projectDir, DEFAULT, [Platform.WINDOWS], { devDependencies: { "electron-updater": "^7.3.1" } }, devMetadata)).not.toThrow()
      })
    })

    test("dependencies take precedence over devDependencies", async ({ tmpDir }) => {
      await withProjectDir(tmpDir, null, projectDir => {
        expect(() =>
          checkDependencies({ "electron-updater": "^7.3.1" }, projectDir, DEFAULT, [Platform.WINDOWS], { devDependencies: { "electron-updater": "^6.8.10" } })
        ).not.toThrow()
      })
    })

    test("an unresolvable specifier, a missing electron-updater and a build without platforms are not checked", async ({ tmpDir }) => {
      await withProjectDir(tmpDir, null, projectDir => {
        expect(() => checkDependencies({ "electron-updater": "catalog:" }, projectDir, DEFAULT)).not.toThrow()
        expect(() => checkDependencies({}, projectDir, DEFAULT)).not.toThrow()
      })
      await withProjectDir(tmpDir, "7.0.0-alpha.12", projectDir => {
        expect(() => checkDependencies({ "electron-updater": "^7.0.0-alpha.12" }, projectDir, DEFAULT, [])).not.toThrow()
      })
    })
  })
})

describe("electronUpdaterRequirements", () => {
  test("resolves each platform's range as its targets do and whether it publishes binary .blockmap files", () => {
    const config = { electronUpdaterCompatibility: ">=7.1", win: { electronUpdaterCompatibility: ">=6" }, linux: { electronUpdaterCompatibility: ">=8" } }
    const defaults = (...platforms: Array<Platform>) => platforms.map(it => [it, [DEFAULT_TARGET]] as const)
    expect(electronUpdaterRequirements(config, defaults(Platform.WINDOWS, Platform.MAC, Platform.LINUX))).toEqual([
      { platform: "windows", range: ">=6", binaryBlockMap: false },
      { platform: "mac", range: ">=7.1", binaryBlockMap: true },
      { platform: "linux", range: ">=8", binaryBlockMap: false },
    ])
    expect(electronUpdaterRequirements({}, defaults(Platform.MAC))).toEqual([{ platform: "mac", range: ">=7", binaryBlockMap: true }])
    expect(electronUpdaterRequirements({ blockmap: "v2" }, defaults(Platform.WINDOWS))).toEqual([{ platform: "windows", range: ">=7", binaryBlockMap: false }])
    expect(electronUpdaterRequirements({ blockmap: "latest" }, defaults(Platform.WINDOWS))).toEqual([{ platform: "windows", range: ">=7", binaryBlockMap: true }])
    expect(electronUpdaterRequirements({}, [[Platform.WINDOWS, ["portable"]]])).toEqual([{ platform: "windows", range: ">=7", binaryBlockMap: false }])
  })
})

describe("resolveTargetNames", () => {
  test("resolves the requested targets, else the platform's target option, else the default targets", () => {
    const names = (targets: Map<Platform, Map<Arch, Array<string>>>, config: Configuration = {}) =>
      Object.fromEntries([...resolveTargetNames(targets, config)].map(([p, n]) => [p.name, [...n]]))
    expect(names(Platform.WINDOWS.createTarget("portable", Arch.x64))).toEqual({ windows: ["portable"] })
    expect(names(Platform.MAC.createTarget("dir", Arch.arm64))).toEqual({ mac: ["dir"] })
    // the CLI's requested targets win over the target option, as in the build
    expect(names(Platform.WINDOWS.createTarget("portable", Arch.x64), { win: { target: "nsis" } })).toEqual({ windows: ["portable"] })
    expect(names(Platform.WINDOWS.createTarget(null, Arch.x64), { win: { target: [{ target: "portable" }, "appx:x64"] } })).toEqual({ windows: ["portable", "appx"] })
    expect(names(Platform.MAC.createTarget(null, Arch.arm64), { mac: { target: "mas" } })).toEqual({ mac: ["mas"] })
    // an arch that no configured target covers builds the default targets
    expect(names(Platform.WINDOWS.createTarget(null, Arch.ia32), { win: { target: "portable:x64" } })).toEqual({ windows: [DEFAULT_TARGET, "portable"] })
    expect(names(Platform.WINDOWS.createTarget(null, Arch.x64))).toEqual({ windows: [DEFAULT_TARGET] })
    expect(names(Platform.MAC.createTarget())).toEqual({ mac: [DEFAULT_TARGET] })
  })

  test("leaves the requested targets as the build resolves them afterwards", () => {
    const config: Configuration = { win: { target: [{ target: "nsis", arch: ["x64", "ia32"] }] } }
    // --win --x64: the configured archs of the target win over the requested one
    const requested = () => Platform.WINDOWS.createTarget(null, Arch.x64)
    const targets = requested()
    resolveTargetNames(targets, config)
    expect(targets).toEqual(requested())
    const resolve = (archToType: Map<Arch, Array<string>>) => computeArchToTargetNamesMap(archToType, { platformOptions: config.win!, defaultTarget: [] }, Platform.WINDOWS)
    const fresh = resolve(requested().get(Platform.WINDOWS)!)
    expect(fresh).toEqual(
      new Map([
        [Arch.x64, ["nsis"]],
        [Arch.ia32, ["nsis"]],
      ])
    )
    expect(resolve(targets.get(Platform.WINDOWS)!)).toEqual(fresh)
  })
})

describe("Packager electron-updater check", () => {
  // the CLI publish and verify commands target the host platform, but build nothing
  test("publish and verify (validateConfig) do not check the host platform's range; a build checks the platforms it builds", async ({ tmpDir }) => {
    await withProjectDir(tmpDir, "6.8.10", async projectDir => {
      await fsExtra.outputJson(path.join(projectDir, "package.json"), {
        name: "test-app",
        version: "1.0.0",
        description: "test",
        author: "test",
        dependencies: { "electron-updater": "^6.8.10" },
      })
      // a Windows-only app on electron-updater 6, published from a macOS host
      const options = { projectDir, targets: Platform.MAC.createTarget(), config: { win: { electronUpdaterCompatibility: ">=6" } } }
      await expect(new Packager(options).validateConfig()).resolves.toBeUndefined()
      await expect(new Packager(options).build()).rejects.toThrow(/electron-updater 6\.8\.10 does not satisfy electronUpdaterCompatibility ">=7" of mac/)
    })
  })
})
