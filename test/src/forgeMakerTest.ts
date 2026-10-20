import type { MakeOptions } from "@electron-forge/core"
import { ElectronBuilderForgeMaker } from "app-builder-lib"
import { execFileSync } from "child_process"
import * as fs from "fs/promises"
import { createRequire } from "module"
import * as path from "path"
import { describe, expectTypeOf, test, vi } from "vitest"
import * as appImageModule from "../../packages/electron-forge-maker-appimage/main.js"
import * as nsisWebModule from "../../packages/electron-forge-maker-nsis-web/main.js"
import * as nsisModule from "../../packages/electron-forge-maker-nsis/main.js"
import * as snapModule from "../../packages/electron-forge-maker-snap/main.js"

const { default: MakerAppImage } = appImageModule
const { default: MakerNsis } = nsisModule
const { default: MakerSnap } = snapModule

/** An entry of Forge's `makers` config (`ForgeConfigMaker` in `@electron-forge/shared-types`). */
type ForgeConfigMaker = Exclude<NonNullable<MakeOptions["overrideTargets"]>, string[]>[number]

// Forge's own `make` (`@electron-forge/core`), run in plain Node so it loads the makers exactly as in a Forge project:
// its `importSearch` imports the package by name and `new`s the default export, or takes an instance from `require()`,
// then runs the MakerBase lifecycle and calls `make()`. electron-builder's config validation rejects the maker config
// before anything is built, which shows the config reached `build()` under the target's key.
const FORGE_MAKE = `
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

const [coreEntry, pkg, named, platform, config] = process.argv.slice(2)
const { api } = await import(pathToFileURL(coreEntry).href)
async function make(target) {
  try {
    return { artifacts: await api.make({ dir: process.cwd(), fromPackage: true, platform, arch: "x64", overrideTargets: [target] }) }
  } catch (error) {
    return { error: String(error?.message ?? error) }
  }
}
const required = createRequire(coreEntry)(pkg)
console.log(JSON.stringify({
  byName: await make({ name: pkg, config: JSON.parse(config) }),
  byRequiredInstance: await make(new required[named](JSON.parse(config))),
}))
`

const makers = [
  {
    pkg: "electron-forge-maker-appimage",
    named: "MakerAppImage",
    module: appImageModule,
    name: "appimage",
    platform: "linux",
    targetKey: "linux",
    target: "appimage",
    configKey: "appImage",
  },
  { pkg: "electron-forge-maker-snap", named: "MakerSnap", module: snapModule, name: "snap", platform: "linux", targetKey: "linux", target: "snap", configKey: "snapcraft" },
  { pkg: "electron-forge-maker-nsis", named: "MakerNsis", module: nsisModule, name: "nsis", platform: "win32", targetKey: "win", target: "nsis", configKey: "nsis" },
  {
    pkg: "electron-forge-maker-nsis-web",
    named: "MakerNsisWeb",
    module: nsisWebModule,
    name: "nsis-web",
    platform: "win32",
    targetKey: "win",
    target: "nsis-web",
    configKey: "nsisWeb",
  },
] as const

describe.each(makers)("$pkg", ({ pkg, named, module, name, platform, targetKey, target, configKey }) => {
  const Maker = module.default

  test("is loaded and run by Electron Forge's make", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "forge-maker-project" })
    await fs.mkdir(path.join(projectDir, "out", `App-${platform}-x64`), { recursive: true })
    await fs.mkdir(path.join(projectDir, "node_modules", "electron"), { recursive: true })
    await fs.writeFile(path.join(projectDir, "node_modules", "electron", "package.json"), JSON.stringify({ name: "electron", version: "38.0.0" }))
    await fs.writeFile(path.join(projectDir, "package.json"), JSON.stringify({ name: "app", productName: "App", version: "1.0.0", devDependencies: { electron: "38.0.0" } }))
    const script = path.join(projectDir, "forge-make.mjs")
    await fs.writeFile(script, FORGE_MAKE)

    // snapcraft always needs a base; give it one so the unknown key is what gets reported
    const config = configKey === "snapcraft" ? { base: "core24", notAnOption: true } : { notAnOption: true }
    const forgeCore = createRequire(__filename).resolve("@electron-forge/core")
    const output = execFileSync(process.execPath, [script, forgeCore, pkg, named, platform, JSON.stringify(config)], { cwd: projectDir, encoding: "utf8" })
    const result = JSON.parse(output.trim().split("\n").pop() ?? "")
    const expected = { error: expect.stringContaining(`configuration.${configKey} has an unknown property 'notAnOption'`) }
    expect(result).toEqual({ byName: expected, byRequiredInstance: expected })
  })

  test("exports the maker by name and the Electron Forge 5 platform check", async ({ expect }) => {
    expect((module as Record<string, unknown>)[named]).toBe(Maker)
    await expect(module.isSupportedOnCurrentPlatform()).resolves.toBe(true)
    expectTypeOf<InstanceType<typeof Maker>>().toExtend<ForgeConfigMaker>()
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

  test("accepts platforms typed as Forge 7's string-based ForgePlatform", ({ expect }) => {
    const platforms: string[] = ["win32", "freebsd"]
    expectTypeOf<ConstructorParameters<typeof MakerNsis>[1]>().toExtend<ReadonlyArray<string> | null | undefined>()
    expectTypeOf(platforms).toExtend<NonNullable<ConstructorParameters<typeof MakerNsis>[1]>>()
    expect(new MakerNsis({}, platforms).platforms).toEqual(["win32"])
    expect(new MakerNsis({}, platforms).clone().platforms).toEqual(["win32"])
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
