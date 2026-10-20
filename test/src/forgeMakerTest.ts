import { ElectronBuilderForgeMaker } from "app-builder-lib"
import { execFileSync } from "child_process"
import * as fs from "fs/promises"
import * as path from "path"
import { describe, test, vi } from "vitest"
import MakerAppImage from "../../packages/electron-forge-maker-appimage/main.js"
import MakerNsisWeb from "../../packages/electron-forge-maker-nsis-web/main.js"
import MakerNsis from "../../packages/electron-forge-maker-nsis/main.js"
import MakerSnap from "../../packages/electron-forge-maker-snap/main.js"

const PACKAGES_DIR = path.resolve(__dirname, "../../packages")

const makers = [
  {
    pkg: "electron-forge-maker-appimage",
    named: "MakerAppImage",
    Maker: MakerAppImage,
    name: "appimage",
    platform: "linux",
    targetKey: "linux",
    target: "appimage",
    configKey: "appImage",
  },
  { pkg: "electron-forge-maker-snap", named: "MakerSnap", Maker: MakerSnap, name: "snap", platform: "linux", targetKey: "linux", target: "snap", configKey: "snapcraft" },
  { pkg: "electron-forge-maker-nsis", named: "MakerNsis", Maker: MakerNsis, name: "nsis", platform: "win32", targetKey: "win", target: "nsis", configKey: "nsis" },
  {
    pkg: "electron-forge-maker-nsis-web",
    named: "MakerNsisWeb",
    Maker: MakerNsisWeb,
    name: "nsis-web",
    platform: "win32",
    targetKey: "win",
    target: "nsis-web",
    configKey: "nsisWeb",
  },
] as const

// Replicates how @electron-forge/core 8 (packages/api/core/src/api/make.ts + util/import-search.ts) resolves a
// `{ name, config }` maker: `import()` the package, take its default export, `new` it with (config, platforms), then
// call isSupportedOnCurrentPlatform/ensureExternalBinariesExist/clone/prepareConfig. Runs in plain Node so the
// package's real `exports` map and its compiled app-builder-lib dependency are what get loaded.
const FORGE_PROBE = `
import path from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

async function importSearch(relativeTo, paths) {
  const testPaths = paths.concat(paths.map(p => path.resolve(relativeTo, p))).concat(paths.map(p => path.resolve(relativeTo, "node_modules", p)))
  for (const testPath of testPaths) {
    try {
      const result = await import(path.isAbsolute(testPath) ? pathToFileURL(testPath).toString() : testPath)
      return typeof result === "object" && result && result.default ? result.default : null
    } catch (err) {
      if (err.code !== "ERR_MODULE_NOT_FOUND") throw err
    }
  }
  return null
}

const [pkg, named, platform] = process.argv.slice(2)
const MakerClass = await importSearch(process.cwd(), [pkg])
const maker = new MakerClass(arch => ({ artifactName: "app-" + arch + ".\${ext}" }), undefined)
maker.ensureExternalBinariesExist()
const clone = maker.clone()
await clone.prepareConfig("arm64")
const required = createRequire(import.meta.url)(pkg)
const instance = new required[named]({}, ["darwin"])
console.log(JSON.stringify({
  isMaker: maker.__isElectronForgeMaker,
  name: maker.name,
  makesForPlatform: maker.platforms.includes(platform),
  isSupported: maker.isSupportedOnCurrentPlatform(),
  cloneIsSameClass: Object.getPrototypeOf(clone) === Object.getPrototypeOf(maker),
  config: clone.config,
  requireDefaultIsNamed: required.default === required[named],
  instanceIsMaker: instance.__isElectronForgeMaker,
  instancePlatforms: instance.platforms,
  legacyIsSupported: await required.isSupportedOnCurrentPlatform(),
}))
`

describe.each(makers)("$pkg", ({ pkg, named, Maker, name, platform, targetKey, target, configKey }) => {
  test("loads and runs as a maker the way Electron Forge resolves it", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "forge-maker-project" })
    await fs.mkdir(path.join(projectDir, "node_modules"), { recursive: true })
    await fs.symlink(path.join(PACKAGES_DIR, pkg), path.join(projectDir, "node_modules", pkg), "junction")
    const probe = path.join(projectDir, "probe.mjs")
    await fs.writeFile(probe, FORGE_PROBE)

    const output = execFileSync(process.execPath, [probe, pkg, named, platform], { cwd: projectDir, encoding: "utf8" })
    expect(JSON.parse(output.trim().split("\n").pop() ?? "")).toEqual({
      isMaker: true,
      name,
      makesForPlatform: true,
      isSupported: true,
      cloneIsSameClass: true,
      config: { artifactName: "app-arm64.${ext}" },
      requireDefaultIsNamed: true,
      instanceIsMaker: true,
      instancePlatforms: ["darwin"],
      legacyIsSupported: true,
    })
  })

  test("maps Forge make() options onto electron-builder build options", async ({ expect }) => {
    const maker: ElectronBuilderForgeMaker = Reflect.construct(Maker, [{ artifactName: "custom.${ext}" }])
    await maker.prepareConfig("x64")
    const dir = path.resolve("out", `My App-${platform}-x64`)
    expect(maker.getBuildOptions({ dir, makeDir: "/forge/out/make", targetArch: "x64", appName: "My App", targetPlatform: platform })).toEqual({
      [targetKey]: [`${target}:x64`],
      prepackaged: dir,
      config: {
        executableName: "My App",
        [configKey]: { artifactName: "custom.${ext}" },
        directories: { output: "/forge/out/make" },
      },
    })
  })
})

describe("ElectronBuilderForgeMaker", () => {
  test("uses Forge's packagerConfig.executableName over the app name", ({ expect }) => {
    const options = new MakerNsis().getBuildOptions({
      dir: "out/app-win32-x64",
      targetArch: "x64",
      appName: "My App",
      forgeConfig: { packagerConfig: { executableName: "my-app" } },
    })
    expect(options.config).toMatchObject({ executableName: "my-app" })
  })

  test("defaults the output to a make directory next to the packaged app", ({ expect }) => {
    const options = new MakerAppImage().getBuildOptions({ dir: path.join("/forge", "out", "app-linux-x64"), targetArch: "arm64" })
    expect(options).toEqual({
      linux: ["appimage:arm64"],
      prepackaged: path.resolve("/forge/out/app-linux-x64"),
      config: { directories: { output: path.resolve("/forge/out/make") } },
    })
  })

  test("leaves an empty Forge config out of the target configuration", async ({ expect }) => {
    // as a JS forge.config `{ name, config: {} }` entry passes it
    const maker = new MakerSnap({} as any)
    await maker.prepareConfig("x64")
    expect(maker.getBuildOptions({ dir: "/forge/out/app-linux-x64", makeDir: "/forge/out/make", targetArch: "x64" }).config).toEqual({ directories: { output: "/forge/out/make" } })
  })

  test("resolves a config fetcher per arch and keeps it across clones", async ({ expect }) => {
    const fetcher = vi.fn((arch: string) => Promise.resolve({ oneClick: arch === "x64" }))
    const maker = new MakerNsis(fetcher, ["win32", "linux"])
    const clone = maker.clone()
    expect(clone).toBeInstanceOf(MakerNsis)
    expect(clone).toBeInstanceOf(ElectronBuilderForgeMaker)
    expect(clone).not.toBe(maker)
    expect(clone.platforms).toEqual(["win32", "linux"])
    await clone.prepareConfig("arm64")
    expect(clone.config).toEqual({ oneClick: false })
    expect(fetcher).toHaveBeenCalledWith("arm64")
    expect(maker.config).toBeUndefined()
  })

  test("make() prepares the config and hands the mapped options to electron-builder", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "forge-maker-make" })
    const appDir = path.join(projectDir, "out", "app-linux-x64")
    await fs.mkdir(appDir, { recursive: true })
    await fs.writeFile(path.join(projectDir, "package.json"), JSON.stringify({ name: "app", version: "1.0.0", devDependencies: { electron: "38.0.0" } }))

    // A snapcraft config without `base` is rejected by electron-builder's config validation, before anything is built
    const maker = new MakerSnap({ core24: { grade: "devel" } } as any)
    const getBuildOptions = maker.getBuildOptions.bind(maker)
    vi.spyOn(maker, "getBuildOptions").mockImplementation(options => ({ ...getBuildOptions(options), projectDir }))
    await expect(maker.make({ dir: appDir, makeDir: path.join(projectDir, "out", "make"), targetArch: "x64" })).rejects.toThrow("`snapcraft` is missing the required `base` field")
    expect(maker.config).toEqual({ core24: { grade: "devel" } })
  })

  test("default export can still be called as an Electron Forge 5 maker function", async ({ expect }) => {
    const make = vi.spyOn(ElectronBuilderForgeMaker.prototype, "make").mockResolvedValue(["/forge/out/make/app.exe"])
    try {
      const legacyMaker: unknown = MakerNsis
      if (typeof legacyMaker !== "function") {
        throw new Error("expected a function")
      }
      await expect(legacyMaker({ dir: "/forge/out/app-win32-x64", targetArch: "ia32", appName: "App", forgeConfig: {} })).resolves.toEqual(["/forge/out/make/app.exe"])
      expect(make).toHaveBeenCalledWith({ dir: "/forge/out/app-win32-x64", targetArch: "ia32", appName: "App" })
      expect(() => legacyMaker()).toThrow(TypeError)
    } finally {
      make.mockRestore()
    }
  })
})
