import {
  BUILDER_UTIL_RUNTIME_VERSION,
  checkCollectedElectronUpdater,
  checkMetadata,
  ELECTRON_UPDATER_PAIRING_DOCS_URL,
  ELECTRON_UPDATER_VERSION,
  findInstalledPackage,
  PACKAGE_VERSION,
  REQUIRED_ELECTRON_UPDATER_MAJOR,
} from "app-builder-lib/internal"
import { InvalidConfigurationError, log } from "builder-util"
import fsExtra from "fs-extra"
import * as path from "path"
import * as semver from "semver"
import { afterEach, describe, test, vi } from "vitest"

const PACKAGES_DIR = path.join(__dirname, "..", "..", "packages")

const baseMetadata = { name: "test-app", version: "1.0.0", description: "test", author: "test" }

/** Runs checkMetadata on a single package.json layout (app dir = project dir). */
function check(projectDir: string, fields: Record<string, unknown>) {
  const metadata: any = { ...baseMetadata, ...fields }
  checkMetadata(metadata, metadata, path.join(projectDir, "package.json"), path.join(projectDir, "package.json"), projectDir)
}

function errorOf(fn: () => void): Error | null {
  try {
    fn()
    return null
  } catch (e: any) {
    return e
  }
}

/** Writes `<dir>/node_modules/<name>/package.json` and returns that file. */
async function install(dir: string, name: string, version: string, extra: Record<string, unknown> = {}): Promise<string> {
  const file = path.join(dir, "node_modules", name, "package.json")
  await fsExtra.outputJson(file, { name, version, ...extra })
  return file
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("electron-updater pairing at build start", () => {
  test("no check when the app does not use electron-updater", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "no-updater" })
    // installed (e.g. by another workspace package) but not declared by this app
    await install(projectDir, "electron-updater", "6.8.3")
    expect(() => check(projectDir, { dependencies: { "left-pad": "^1.0.0" } })).not.toThrow()
    expect(() => check(projectDir, {})).not.toThrow()
  })

  test("electron-updater 6 in dependencies fails with the found version, where it was resolved and the migration link", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "updater-6" })
    const resolved = await install(projectDir, "electron-updater", "6.8.3")

    const error = errorOf(() => check(projectDir, { dependencies: { "electron-updater": "^6.8.3" } }))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    const message = error!.message
    expect(message).toContain("electron-builder v27 requires electron-updater 7")
    expect(message).toContain("found electron-updater 6.8.3")
    expect(message).toContain(resolved)
    expect(message).toContain("Upgrade electron-updater to ^7")
    expect(message.trimEnd().endsWith("https://www.electron.build/docs/migration/v27-breaking-changes#electron-updater-7-is-required")).toBe(true)
  })

  test.for(["7.0.0", "7.4.2", "7.0.0-alpha.10", "7.0.0-beta.1"])("electron-updater %s passes", async (version, { expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "updater-7" })
    await install(projectDir, "electron-updater", version)
    expect(() => check(projectDir, { dependencies: { "electron-updater": `^${version}` } })).not.toThrow()
  })

  test("a newer electron-updater major fails too", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "updater-8" })
    await install(projectDir, "electron-updater", "8.0.0")
    expect(() => check(projectDir, { dependencies: { "electron-updater": "^8.0.0" } })).toThrow(/found electron-updater 8\.0\.0/)
  })

  test("the installed version wins over the declared range", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "installed-wins" })
    await install(projectDir, "electron-updater", "6.8.3")
    expect(() => check(projectDir, { dependencies: { "electron-updater": "^7.0.0" } })).toThrow(/found electron-updater 6\.8\.3/)
    expect(() => check(projectDir, { dependencies: { "electron-updater": "catalog:" } })).toThrow(/found electron-updater 6\.8\.3/)
  })

  test("a bundled app that keeps electron-updater in devDependencies is checked", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "bundled" })
    await install(projectDir, "electron-updater", "6.8.3")
    expect(() => check(projectDir, { devDependencies: { "electron-updater": "^6.8.3" } })).toThrow(/electron-builder v27 requires electron-updater 7/)

    await install(projectDir, "electron-updater", "7.0.0-alpha.10")
    expect(() => check(projectDir, { devDependencies: { "electron-updater": "^7.0.0-alpha.10" } })).not.toThrow()
  })

  test("resolves an electron-updater hoisted to the workspace root", async ({ expect, tmpDir }) => {
    const workspaceRoot = await tmpDir.getTempDir({ prefix: "workspace" })
    const projectDir = path.join(workspaceRoot, "packages", "app")
    await fsExtra.ensureDir(projectDir)
    const resolved = await install(workspaceRoot, "electron-updater", "6.8.3")
    expect(() => check(projectDir, { dependencies: { "electron-updater": "^6.8.3" } })).toThrow(resolved)
  })

  test("reads the version even when the exports map does not expose ./package.json", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "exports-map" })
    await install(projectDir, "electron-updater", "6.8.3", { exports: { ".": { require: "./dist/index.js" } } })
    expect(() => check(projectDir, { dependencies: { "electron-updater": "catalog:" } })).toThrow(/found electron-updater 6\.8\.3/)
  })

  test("two package.json layout: checks the app package.json and resolves from the app dir first", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "two-package" })
    const appDir = path.join(projectDir, "app")
    await install(appDir, "electron-updater", "6.8.3")
    await install(projectDir, "electron-updater", "7.0.0")
    const appMetadata: any = { ...baseMetadata, dependencies: { "electron-updater": "^6.8.3" } }
    const devMetadata: any = { ...baseMetadata }
    expect(() => checkMetadata(appMetadata, devMetadata, path.join(appDir, "package.json"), path.join(projectDir, "package.json"), projectDir, appDir)).toThrow(
      path.join(appDir, "node_modules", "electron-updater", "package.json")
    )
  })

  test("two package.json layout: a devDependency of the development package.json is checked", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "two-package-dev" })
    const appDir = path.join(projectDir, "app")
    await fsExtra.ensureDir(appDir)
    await install(projectDir, "electron-updater", "6.8.3")
    const appMetadata: any = { ...baseMetadata }
    const devMetadata: any = { ...baseMetadata, devDependencies: { "electron-updater": "^6.8.3" } }
    expect(() => checkMetadata(appMetadata, devMetadata, path.join(appDir, "package.json"), path.join(projectDir, "package.json"), projectDir, appDir)).toThrow(
      /found electron-updater 6\.8\.3/
    )
  })

  describe("declared but not installed: the specifier is checked, and one that pins no version fails", () => {
    test.for([
      ["^6.2.1", "6.2.1"],
      ["6.8.3", "6.8.3"],
      ["patch:electron-updater@npm%3A6.6.2#~/.yarn/patches/electron-updater-npm-6.6.2-abc.patch", "6.6.2"],
      ["npm:electron-updater@^6.0.0", "6.0.0"],
    ])("%s fails", async ([specifier, lowest], { expect, tmpDir }) => {
      const projectDir = await tmpDir.getTempDir({ prefix: "missing-old" })
      const error = errorOf(() => check(projectDir, { dependencies: { "electron-updater": specifier } }))
      expect(error).toBeInstanceOf(InvalidConfigurationError)
      expect(error!.message).toContain("electron-builder v27 requires electron-updater 7")
      expect(error!.message).toContain(lowest)
      expect(error!.message.trimEnd().endsWith(ELECTRON_UPDATER_PAIRING_DOCS_URL)).toBe(true)
    })

    test.for(["^7.0.0-alpha.10", "7.0.0", "~7.1.0", "patch:electron-updater@npm%3A7.0.0#~/.yarn/patches/electron-updater-npm-7.0.0-abc.patch"])(
      "%s passes",
      async (specifier, { expect, tmpDir }) => {
        const projectDir = await tmpDir.getTempDir({ prefix: "missing-7" })
        expect(() => check(projectDir, { dependencies: { "electron-updater": specifier } })).not.toThrow()
      }
    )

    test("link: and file: specifiers read the linked package.json", async ({ expect, tmpDir }) => {
      const root = await tmpDir.getTempDir({ prefix: "missing-link" })
      const projectDir = path.join(root, "project")
      const linked = path.join(root, "updater-src")
      await fsExtra.ensureDir(projectDir)
      await fsExtra.outputJson(path.join(linked, "package.json"), { name: "electron-updater", version: "7.0.0-alpha.10" })
      expect(() => check(projectDir, { dependencies: { "electron-updater": `link:${linked}` } })).not.toThrow()
      expect(() => check(projectDir, { dependencies: { "electron-updater": "file:../updater-src" } })).not.toThrow()
      await fsExtra.outputJson(path.join(linked, "package.json"), { name: "electron-updater", version: "6.8.3" })
      expect(() => check(projectDir, { dependencies: { "electron-updater": `link:${linked}` } })).toThrow(/found electron-updater 6\.8\.3/)
    })

    test.for(["catalog:", "catalog:default", "workspace:*", "github:electron-userland/electron-builder", "latest"])(
      "%s cannot be verified and fails with an install hint",
      async (specifier, { expect, tmpDir }) => {
        const projectDir = await tmpDir.getTempDir({ prefix: "missing-unknown" })
        const error = errorOf(() => check(projectDir, { dependencies: { "electron-updater": specifier } }))
        expect(error).toBeInstanceOf(InvalidConfigurationError)
        expect(error!.message).toContain("electron-builder v27 requires electron-updater 7")
        expect(error!.message).toContain("is not installed")
        expect(error!.message).toContain("Install your dependencies before building")
        expect(error!.message.trimEnd().endsWith(ELECTRON_UPDATER_PAIRING_DOCS_URL)).toBe(true)
      }
    )
  })

  describe("builder-util-runtime of the app's electron-updater", () => {
    const mismatchWarnings = (warn: { mock: { calls: Array<Array<unknown>> } }) => warn.mock.calls.filter(args => String(args[1]).includes("uses builder-util-runtime"))

    test("a different builder-util-runtime warns once and does not fail", async ({ expect, tmpDir }) => {
      const projectDir = await tmpDir.getTempDir({ prefix: "runtime-mismatch" })
      const updater = await install(projectDir, "electron-updater", "7.0.0-alpha.9")
      await install(projectDir, "builder-util-runtime", "10.0.0-alpha.9")
      const warn = vi.spyOn(log, "warn")

      expect(() => check(projectDir, { dependencies: { "electron-updater": "7.0.0-alpha.9" } })).not.toThrow()
      expect(() => check(projectDir, { dependencies: { "electron-updater": "7.0.0-alpha.9" } })).not.toThrow()
      checkCollectedElectronUpdater([{ name: "electron-updater", version: "7.0.0-alpha.9", dir: path.dirname(updater) }])

      const warnings = mismatchWarnings(warn)
      expect(warnings).toHaveLength(1)
      expect(warnings[0][0]).toMatchObject({ appBuilderUtilRuntime: "10.0.0-alpha.9", electronBuilderUtilRuntime: BUILDER_UTIL_RUNTIME_VERSION })
    })

    test("electron-updater's own nested builder-util-runtime is the one compared", async ({ expect, tmpDir }) => {
      const projectDir = await tmpDir.getTempDir({ prefix: "runtime-nested" })
      const updater = await install(projectDir, "electron-updater", ELECTRON_UPDATER_VERSION)
      await install(path.dirname(updater), "builder-util-runtime", BUILDER_UTIL_RUNTIME_VERSION)
      await install(projectDir, "builder-util-runtime", "9.7.0") // hoisted copy used by something else
      const warn = vi.spyOn(log, "warn")
      check(projectDir, { dependencies: { "electron-updater": ELECTRON_UPDATER_VERSION } })
      expect(mismatchWarnings(warn)).toHaveLength(0)
    })

    test("the same builder-util-runtime does not warn", async ({ expect, tmpDir }) => {
      const projectDir = await tmpDir.getTempDir({ prefix: "runtime-same" })
      await install(projectDir, "electron-updater", ELECTRON_UPDATER_VERSION)
      await install(projectDir, "builder-util-runtime", BUILDER_UTIL_RUNTIME_VERSION)
      const warn = vi.spyOn(log, "warn")
      check(projectDir, { dependencies: { "electron-updater": ELECTRON_UPDATER_VERSION } })
      expect(mismatchWarnings(warn)).toHaveLength(0)
    })
  })
})

describe("electron-updater pairing of the collected production node_modules", () => {
  test("a transitive electron-updater 6 fails", ({ expect }) => {
    const nested = { name: "electron-updater", version: "6.8.3", dir: "/project/node_modules/some-lib/node_modules/electron-updater" }
    const error = errorOf(() => checkCollectedElectronUpdater([{ name: "some-lib", version: "1.0.0", dir: "/project/node_modules/some-lib", dependencies: [nested] }]))
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    expect(error!.message).toContain("electron-builder v27 requires electron-updater 7, but found electron-updater 6.8.3")
    expect(error!.message).toContain(path.join(nested.dir, "package.json"))
    expect(error!.message.trimEnd().endsWith(ELECTRON_UPDATER_PAIRING_DOCS_URL)).toBe(true)
  })

  test("an excluded copy, or none, is not checked", ({ expect }) => {
    expect(() => checkCollectedElectronUpdater([{ name: "electron-updater", version: "6.8.3", dir: "/x", excluded: true }])).not.toThrow()
    expect(() => checkCollectedElectronUpdater([{ name: "semver", version: "7.7.3", dir: "/x" }])).not.toThrow()
  })

  test("electron-updater 7 passes", ({ expect }) => {
    expect(() => checkCollectedElectronUpdater([{ name: "electron-updater", version: "7.0.0-alpha.10", dir: "/nonexistent/electron-updater" }])).not.toThrow()
  })
})

describe("electron-updater pairing source of truth", () => {
  // version.ts is written by scripts/update-package-version-export.js on `pnpm ci:version`
  test("version.ts matches the released package versions", async ({ expect }) => {
    const versionOf = async (pkg: string) => (await fsExtra.readJson(path.join(PACKAGES_DIR, pkg, "package.json"))).version
    expect(PACKAGE_VERSION).toBe(await versionOf("app-builder-lib"))
    expect(ELECTRON_UPDATER_VERSION).toBe(await versionOf("electron-updater"))
    expect(BUILDER_UTIL_RUNTIME_VERSION).toBe(await versionOf("builder-util-runtime"))
    expect(REQUIRED_ELECTRON_UPDATER_MAJOR).toBe(semver.major(ELECTRON_UPDATER_VERSION))
  })

  test("findInstalledPackage walks up like Node's resolution", async ({ expect, tmpDir }) => {
    const root = await tmpDir.getTempDir({ prefix: "find-installed" })
    const file = await install(root, "electron-updater", "7.0.0")
    expect(findInstalledPackage("electron-updater", path.join(root, "a", "b"))).toEqual({ version: "7.0.0", packageJsonFile: file })
    expect(findInstalledPackage("not-installed-anywhere-xyz", root)).toBeNull()
  })
})
