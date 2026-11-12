import { Configuration, LinuxPackager, WinPackager } from "app-builder-lib"
import { doMergeConfigs, getConfig, mergeConfigLayers } from "app-builder-lib/internal"
import { NsisTarget } from "app-builder-lib/src/targets/win/nsis/NsisTarget"
import { AppPackageHelper, CopyElevateHelper } from "app-builder-lib/src/targets/win/nsis/nsisUtil"
import { WebInstallerTarget } from "app-builder-lib/src/targets/win/nsis/WebInstallerTarget"
import { mkdir, writeFile } from "fs/promises"
import { Lazy } from "lazy-val"
import * as path from "path"
import type { TmpDir } from "temp-file"
import { describe, test } from "vitest"

describe("mergeConfigLayers", () => {
  test("merges a later plain object key by key into a new object and changes no layer", ({ expect }) => {
    const mac = { sign: { identity: "Developer ID", hardenedRuntime: true }, extendInfo: { A: "1" } }
    const mas = { sign: { identity: "Apple Distribution", entitlements: "mas.plist" } }
    const result = mergeConfigLayers<any>(mac, mas)
    expect(result).toEqual({ sign: { identity: "Apple Distribution", hardenedRuntime: true, entitlements: "mas.plist" }, extendInfo: { A: "1" } })
    expect(mac).toEqual({ sign: { identity: "Developer ID", hardenedRuntime: true }, extendInfo: { A: "1" } })
    expect(mas).toEqual({ sign: { identity: "Apple Distribution", entitlements: "mas.plist" } })

    // an object only one layer sets is copied too, so writing into the result never reaches the layer
    result.extendInfo.B = "2"
    expect(mac.extendInfo).toEqual({ A: "1" })
  })

  test("a later function, class instance or object replaces the earlier value instead of being merged into it", ({ expect }) => {
    const parentHook = () => "parent"
    const projectHook = () => "project"
    expect(mergeConfigLayers<any>({ afterSign: parentHook }, { afterSign: projectHook }).afterSign).toBe(projectHook)
    expect(mergeConfigLayers<any>({ sign: { identity: "x" } }, { sign: projectHook }).sign).toBe(projectHook)
    expect(mergeConfigLayers<any>({ sign: parentHook }, { sign: { identity: "x" } }).sign).toEqual({ identity: "x" })
    // the function was not written into
    expect(Object.keys(parentHook)).toEqual([])

    const ignore = /\.map$/
    expect(mergeConfigLayers<any>({ ignore: /\.txt$/ }, { ignore }).ignore).toBe(ignore)
  })

  test("concatenates two arrays without duplicates, copies an array, keeps an explicit null and skips undefined", ({ expect }) => {
    const files = ["a/**"]
    expect(mergeConfigLayers<any>({ files, target: "dmg", icon: "a.icns" }, { files: ["b/**", "a/**"], target: null, icon: undefined })).toEqual({
      files: ["a/**", "b/**"],
      target: null,
      icon: "a.icns",
    })

    const copied = mergeConfigLayers<any>({ files })
    expect(copied.files).toEqual(["a/**"])
    expect(copied.files).not.toBe(files)
  })

  test("skips __proto__, constructor and prototype keys", ({ expect }) => {
    const result = mergeConfigLayers<any>(JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"x": 1}, "a": 1}'))
    expect(result).toEqual({ a: 1 })
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(({} as any).polluted).toBeUndefined()
  })
})

describe("configuration cascades", () => {
  function getOptionsForTarget(linux: Record<string, any>, config: Record<string, any>, key: string): any {
    return LinuxPackager.prototype.getOptionsForTarget.call({ platformSpecificBuildOptions: linux, config: { linux, ...config } }, key)
  }

  test("a target's options are merged into a new object: building deb changes neither linux nor another target", ({ expect }) => {
    const linux = { desktop: { entry: { Name: "App" } }, publish: { provider: "github", owner: "o", repo: "r" } }
    const config = { deb: { desktop: { entry: { Comment: "deb only" } }, publish: { provider: "generic", url: "https://example.com/deb" } } }

    expect(getOptionsForTarget(linux, config, "deb").desktop.entry).toEqual({ Name: "App", Comment: "deb only" })
    expect(getOptionsForTarget(linux, config, "appImage").desktop.entry).toEqual({ Name: "App" })
    // a target's publish replaces the platform's, and without one its options carry none (the publish resolution falls back to linux.publish)
    expect(getOptionsForTarget(linux, config, "deb").publish).toEqual({ provider: "generic", url: "https://example.com/deb" })
    expect(getOptionsForTarget(linux, config, "appImage").publish).toBeUndefined()
    expect(linux).toEqual({ desktop: { entry: { Name: "App" } }, publish: { provider: "github", owner: "o", repo: "r" } })
  })

  test("the platform compression level does not reach a target's options, where compression is an algorithm", ({ expect }) => {
    const linux = { compression: "maximum" }
    expect(getOptionsForTarget(linux, { deb: {} }, "deb").compression).toBeUndefined()
    expect(getOptionsForTarget(linux, { deb: { compression: "xz" } }, "deb").compression).toBe("xz")
  })

  test("building the web installer does not change the nsis options it inherits", async ({ expect, tmpDir }) => {
    const nsis = { publish: { provider: "generic", url: "https://example.com/nsis" }, oneClick: false }
    const nsisWeb = { publish: { provider: "s3", bucket: "bucket" } }
    const packager = await createWinPackager(tmpDir, { nsis, nsisWeb } as Configuration)

    const web = new WebInstallerTarget(packager, packager.projectDir, "nsis-web", new AppPackageHelper(new CopyElevateHelper()))
    expect(web.options.oneClick).toBe(false)
    expect(web.options.publish).toEqual({ provider: "s3", bucket: "bucket" })
    expect(nsis.publish).toEqual({ provider: "generic", url: "https://example.com/nsis" })

    const installer = new NsisTarget(packager, packager.projectDir, "nsis", new AppPackageHelper(new CopyElevateHelper()))
    expect(installer.options.publish).toEqual({ provider: "generic", url: "https://example.com/nsis" })
  })

  test("a later configuration layer's hook function wins, and the earlier layers are not changed", ({ expect }) => {
    const parentHook = () => undefined
    const projectHook = () => undefined
    const parent: Configuration = { afterSign: parentHook, mac: { sign: { identity: "parent" } } }
    const project: Configuration = { afterSign: projectHook, mac: { sign: { entitlements: "entitlements.plist" } } }

    const result = doMergeConfigs([parent, project])
    expect(result.afterSign).toBe(projectHook)
    expect(result.mac?.sign).toEqual({ identity: "parent", entitlements: "entitlements.plist" })
    expect(parent.mac).toEqual({ sign: { identity: "parent" } })
  })

  test("the build({ config }) layer wins over the configuration file, and the loaded file is not changed", async ({ expect, tmpDir }) => {
    const projectDir = await tmpDir.getTempDir({ prefix: "merge-config-layers" })
    await mkdir(projectDir, { recursive: true })
    await writeFile(
      path.join(projectDir, "electron-builder.cjs"),
      `module.exports = { afterSign: function fileHook() {}, publish: [{ provider: "generic", url: "https://example.com/file" }], mac: { sign: { identity: "file" } } }`
    )
    const metadata = () => new Lazy(() => Promise.resolve({ name: "test-app", version: "1.0.0" }))
    const programmaticHook = () => undefined
    const programmatic: Configuration = {
      afterSign: programmaticHook,
      publish: { provider: "generic", url: "https://example.com/programmatic" },
      mac: { sign: { entitlements: "entitlements.plist" } },
    }

    const config = await getConfig(projectDir, null, programmatic, metadata())
    expect(config.afterSign).toBe(programmaticHook)
    expect(config.publish).toEqual([{ provider: "generic", url: "https://example.com/programmatic" }])
    expect(config.mac?.sign).toEqual({ identity: "file", entitlements: "entitlements.plist" })
    expect(programmatic.mac).toEqual({ sign: { entitlements: "entitlements.plist" } })

    // the module is cached: a second build in the same process still reads the file's own values
    const fileOnly = await getConfig(projectDir, null, null, metadata())
    expect(fileOnly.publish).toEqual([{ provider: "generic", url: "https://example.com/file" }])
    expect(fileOnly.mac?.sign).toEqual({ identity: "file" })
  })
})

async function createWinPackager(tmpDir: TmpDir, config: Configuration): Promise<WinPackager> {
  const projectDir = await tmpDir.getTempDir({ prefix: "merge-config-layers-win" })
  await mkdir(projectDir, { recursive: true })
  const fakePackagerInfo = {
    config: { appId: "org.electron-builder.testApp", ...config },
    metadata: { name: "TestApp", productName: "Test App", version: "1.1.0", description: "Test Application", author: { name: "Foo Bar" } },
    devMetadata: null,
    options: {},
    projectDir,
    buildResourcesDir: path.join(projectDir, "build"),
    relativeBuildResourcesDirname: "build",
    repositoryInfo: Promise.resolve(null),
    tempDirManager: tmpDir,
    framework: { defaultAppIdPrefix: "com.electron." },
  }
  return new WinPackager(fakePackagerInfo as any)
}
