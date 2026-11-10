import { copyOrLinkFile, exec, log } from "builder-util"
import { vi } from "vitest"
import { MacPackager } from "app-builder-lib"
import { Arch, createTargets, DIR_TARGET, Platform } from "electron-builder"
import * as fs from "fs/promises"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { app, appThrows, assertPack, checkDirContents, modifyPackageJson, platform } from "../helpers/packTester"
import { verifySmartUnpack } from "../helpers/verifySmartUnpack"
import { parsePlistFile, PlistObject } from "app-builder-lib/internal"

/** The fields of the warnings that announce the v27 change of the MAS Info.plist options (v27-build-changes#mas-info-plist-options). */
function masInfoPlistWarnings(warn: { mock: { calls: Array<Array<unknown>> } }): Array<unknown> {
  return warn.mock.calls.filter(([, message]) => typeof message === "string" && message.includes("#mas-info-plist-options")).map(([fields]) => fields)
}

describe("macPackager", { concurrent: false }, () => {
  test.ifMac("two-package", ({ expect }) =>
    assertPack(
      expect,
      "test-app",
      {
        targets: createTargets([Platform.MAC], null, "all"),
        config: {
          extraMetadata: {
            repository: "foo/bar",
          },
          downloadAlternateFFmpeg: true,
          mac: {
            electronUpdaterCompatibility: ">=2.16",
            electronLanguages: ["bn", "en"],
            sign: { timestamp: undefined },
            notarize: false,
          },
          dmg: {
            title: "Foo1",
          },
          //tslint:disable-next-line:no-invalid-template-strings
          artifactName: "${name}-${version}-${os}-${arch}.${ext}",
          electronFuses: {
            runAsNode: true,
            enableCookieEncryption: true,
            enableNodeOptionsEnvironmentVariable: true,
            enableNodeCliInspectArguments: true,
            enableEmbeddedAsarIntegrityValidation: true,
            onlyLoadAppFromAsar: true,
            loadBrowserProcessSpecificV8Snapshot: true,
            grantFileProtocolExtraPrivileges: undefined, // unsupported on current electron version in our tests
          },
        },
      },
      {
        signedMac: true,
        // Universal merge, fuses, languages and signing are all asserted on the .app bundles, so stop before the
        // 3 dmg + 3 zip targets are built. The full build (artifactName macros, multi-arch latest-mac.yml) is kept
        // as "two-package (e2e)" in macPackager.e2e.ts.
        afterPackTestHook: async () => true,
        checkMacApp: async appDir => {
          const resources = await fs.readdir(path.join(appDir, "Contents", "Resources"))
          expect(resources.filter(it => !it.startsWith(".")).sort()).toMatchSnapshot()

          const electronFrameworkResources = await fs.readdir(path.join(appDir, "Contents", "Frameworks", "Electron Framework.framework", "Resources"))
          expect(electronFrameworkResources.filter(it => !it.startsWith(".")).sort()).toMatchSnapshot()
        },
      }
    )
  )

  test.ifMac("one-package", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.MAC.createTarget(undefined, Arch.x64),
        config: {
          appId: "bar",
          publish: {
            provider: "generic",
            //tslint:disable-next-line:no-invalid-template-strings
            url: "https://develar.s3.amazonaws.com/test/${os}/${arch}",
          },
          downloadAlternateFFmpeg: false,
          dmg: {
            title: "Bar2",
          },
          mac: {
            // test appId per platform
            appId: "foo",
            extendInfo: {
              LSUIElement: true,
              CFBundleDocumentTypes: [
                {
                  CFBundleTypeName: "Folders",
                  CFBundleTypeRole: "Editor",
                  LSItemContentTypes: ["public.folder"],
                },
              ],
              // test unsetting a default electron plist value
              NSMicrophoneUsageDescription: undefined,
            },
            minimumSystemVersion: "10.12.0",
            fileAssociations: [
              {
                ext: "foo",
                name: "Foo",
                role: "Viewer",
              },
              {
                ext: "boo",
                name: "Boo",
                role: "Shell",
                rank: "Owner",
                isPackage: true,
              },
              {
                ext: "bar",
                name: "Bar",
                role: "Shell",
                rank: "Default",
                // If I specify `fileAssociations.icon` as `build/foo.icns` will it know to use `build/foo.ico` for Windows?
                icon: "someFoo.ico",
              },
            ],
          },
        },
      },
      {
        signedMac: false,
        projectDirCreated: projectDir =>
          Promise.all([
            copyOrLinkFile(path.join(projectDir, "build", "icon.icns"), path.join(projectDir, "build", "foo.icns")),
            copyOrLinkFile(path.join(projectDir, "build", "icon.icns"), path.join(projectDir, "build", "someFoo.icns")),
          ]),
        checkMacApp: async (appDir, _info) => {
          await assertThat(expect, path.join(appDir, "Contents", "Resources", "foo.icns")).isFile()
          await assertThat(expect, path.join(appDir, "Contents", "Resources", "someFoo.icns")).isFile()
        },
      }
    )
  )

  test.ifMac("yarn two package.json w/ native module", ({ expect }) =>
    assertPack(
      expect,
      "test-app-two-native-modules",
      {
        targets: Platform.MAC.createTarget("zip", Arch.universal),
        config: {
          nativeModules: { npmRebuild: true, rebuildMode: "sequential" },
          fileOptions: { files: ["!**/*.stamp", "!**/*.Makefile"] },
        },
      },
      {
        signedMac: false,
        packed: async context => await verifySmartUnpack(expect, context.getResources(Platform.MAC, Arch.universal)),
      }
    )
  )

  test.ifMac("extraFiles are placed in product app bundle Contents, not Electron.app", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.MAC.createTarget(DIR_TARGET, Arch.x64),
        config: {
          mac: { notarize: false },
          fileOptions: { extraFiles: ["extraTestFile.txt"] },
        },
      },
      {
        signedMac: false,
        projectDirCreated: async projectDir => {
          await fs.writeFile(path.join(projectDir, "extraTestFile.txt"), "test")
          await modifyPackageJson(projectDir, data => {
            data.dependencies = {
              debug: "4.4.3",
            }
          })
        },
        checkMacApp: async appDir => {
          await assertThat(expect, path.join(appDir, "Contents", "extraTestFile.txt")).isFile()
        },
        packed: async context => {
          await checkDirContents(expect, path.join(context.getContent(Platform.MAC, Arch.x64)))
          const resources = context.getResources(Platform.MAC, Arch.x64)
          await verifySmartUnpack(expect, resources)
        },
      }
    )
  )

  test.ifMac("electronDist", ({ expect }) =>
    appThrows(
      expect,
      {
        targets: Platform.MAC.createTarget(DIR_TARGET, Arch.x64),
        config: {
          electronDist: "foo",
        },
      },
      {},
      error => expect(error.message).toContain("Please provide a valid path to the Electron zip file, cache directory, or electron build directory.")
    )
  )

  // The InvalidConfigurationError guard in packager.ts only fires on win32 — Linux is allowed to cross-build macOS.
  test.ifWindows("Build macOS on Windows is not supported", ({ expect }) => appThrows(expect, platform(Platform.MAC)))

  test.ifMac("multiple asar resources", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.MAC.createTarget("zip", Arch.x64),
        config: {
          fileOptions: {
            extraResources: [
              { from: "build", to: "./", filter: "*.asar" },
              { from: "build/subdir", to: "./subdir", filter: "*.asar" },
            ],
          },
          electronLanguages: "en",
        },
      },
      {
        signedMac: true,
        projectDirCreated: async projectDir => {
          await fs.mkdir(path.join(projectDir, "build", "subdir"))
          await fs.copyFile(path.join(projectDir, "build", "extraAsar.asar"), path.join(projectDir, "build", "subdir", "extraAsar2.asar"))
        },
        checkMacApp: async (appDir, _info) => {
          await checkDirContents(expect, path.join(appDir, "Contents", "Resources"))
        },
      }
    )
  )

  test.ifMac("disableAsarIntegrity skips ASAR integrity computation", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.MAC.createTarget(DIR_TARGET, Arch.x64),
        config: {
          mac: { notarize: false },
          asar: { disableIntegrity: true },
        },
      },
      {
        signedMac: false,
        checkMacApp: (_appDir, info) => {
          expect(info.ElectronAsarIntegrity).toBeUndefined()
          return Promise.resolve()
        },
      }
    )
  )

  // Regression test for #8909: bundleVersion/bundleShortVersion from mas config must override mac config.
  // mac.bundleVersion = "100" (wrong value that would appear if the bug were present).
  // mas.bundleVersion = "1.1.0" = fixture appInfo.version (the correct MAS value).
  test.ifMac("mas bundleVersion overrides mac bundleVersion", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.MAC.createTarget("mas", Arch.x64),
        config: {
          mac: { bundleVersion: "100", bundleShortVersion: "1.0.0" },
          mas: { bundleVersion: "1.1.0", bundleShortVersion: "2.0.0" },
        },
      },
      {
        signedMac: false,
        checkMacApp: async appDir => {
          const plistPath = path.join(appDir, "Contents", "Info.plist")
          const bundleVersion = (await exec("/usr/libexec/PlistBuddy", ["-c", "Print CFBundleVersion", plistPath])).trim()
          const shortVersion = (await exec("/usr/libexec/PlistBuddy", ["-c", "Print CFBundleShortVersionString", plistPath])).trim()
          // Must be the mas value, not mac's "100"/"1.0.0"
          expect(bundleVersion).toBe("1.1.0")
          expect(shortVersion).toBe("2.0.0")
        },
      }
    )
  )

  // Regression test for #8909: masDev config overrides mas, which overrides mac (full merge chain).
  // mac="100", mas="200" (both wrong), masDev="1.1.0" (correct — fixture appInfo.version).
  test.ifMac("mas-dev bundleVersion takes precedence over mas and mac", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.MAC.createTarget("mas-dev", Arch.x64),
        config: {
          mac: { bundleVersion: "100" },
          mas: { bundleVersion: "200" },
          masDev: { bundleVersion: "1.1.0" },
        },
      },
      {
        signedMac: false,
        checkMacApp: async appDir => {
          const plistPath = path.join(appDir, "Contents", "Info.plist")
          const bundleVersion = (await exec("/usr/libexec/PlistBuddy", ["-c", "Print CFBundleVersion", plistPath])).trim()
          // Must be masDev's "1.1.0", not mac's "100" or mas's "200"
          expect(bundleVersion).toBe("1.1.0")
        },
      }
    )
  )

  // mas.minimumSystemVersion, mas.category and the per-helper bundle ids apply to the MAS app; v26 used the mac values for them.
  test.ifMac("mas Info.plist options and helper bundle ids override mac", async ({ expect }) => {
    log.resetLimits("mas-info-plist-options:mas")
    const warn = vi.spyOn(log, "warn")
    await app(
      expect,
      {
        targets: Platform.MAC.createTarget("mas", Arch.x64),
        config: {
          mac: { minimumSystemVersion: "12.0", helperBundleId: "org.electron-builder.testApp.mac-helper", helperRendererBundleId: "org.electron-builder.testApp.mac-renderer" },
          mas: { minimumSystemVersion: "13.0", category: "public.app-category.games", helperRendererBundleId: "org.electron-builder.testApp.mas-renderer" },
        },
      },
      {
        signedMac: false,
        checkMacApp: async appDir => {
          const info = await parsePlistFile<PlistObject>(path.join(appDir, "Contents", "Info.plist"))
          expect(info.LSMinimumSystemVersion).toBe("13.0")
          expect(info.LSApplicationCategoryType).toBe("public.app-category.games")
          const cfBundleName = info.CFBundleName as string
          const helperInfo = (suffix: string) =>
            parsePlistFile<PlistObject>(path.join(appDir, "Contents", "Frameworks", `${cfBundleName} Helper ${suffix}.app`, "Contents", "Info.plist"))
          expect((await helperInfo("(Renderer)")).CFBundleIdentifier).toBe("org.electron-builder.testApp.mas-renderer")
          // not overridden on mas: the default still follows the cascaded helperBundleId
          expect((await helperInfo("(GPU)")).CFBundleIdentifier).toBe("org.electron-builder.testApp.mac-helper.GPU")
        },
      }
    )
    // the v27 announcement: once, naming the options whose value is new for the MAS app
    expect(masInfoPlistWarnings(warn)).toEqual([{ options: ["mas.minimumSystemVersion", "mas.category", "mas.helperRendererBundleId"] }])
    warn.mockRestore()
  })

  test.ifMac("mas-dev Info.plist options warn for the layer that sets them, not for a repeated mac value", async ({ expect }) => {
    log.resetLimits("mas-info-plist-options:mas-dev")
    const warn = vi.spyOn(log, "warn")
    await app(
      expect,
      {
        targets: Platform.MAC.createTarget("mas-dev", Arch.x64),
        config: {
          mac: { minimumSystemVersion: "12.0" },
          mas: { minimumSystemVersion: "12.0" },
          masDev: { category: "public.app-category.games" },
        },
      },
      {
        signedMac: false,
        checkMacApp: async appDir => {
          const info = await parsePlistFile<PlistObject>(path.join(appDir, "Contents", "Info.plist"))
          expect(info.LSApplicationCategoryType).toBe("public.app-category.games")
        },
      }
    )
    expect(masInfoPlistWarnings(warn)).toEqual([{ options: ["masDev.category"] }])
    warn.mockRestore()
  })

  // Electron resolves its helper apps at runtime as `${CFBundleName} Helper.app`, so the on-disk
  // helper bundle name and `CFBundleName` must stay identical. Product names with composed Unicode
  // (NFC) must not be decomposed to NFD, otherwise the two diverge byte-for-byte.
  test.ifMac("CFBundleName matches helper bundle name for a Unicode productName", ({ expect }) => {
    const productName = "Tést Café" // composed (NFC) accents that decompose under NFD
    return app(
      expect,
      {
        targets: Platform.MAC.createTarget(DIR_TARGET, Arch.x64),
        config: {
          productName,
          mac: { notarize: false },
        },
      },
      {
        signedMac: false,
        checkMacApp: async appDir => {
          const info = await parsePlistFile<PlistObject>(path.join(appDir, "Contents", "Info.plist"))
          const cfBundleName = info.CFBundleName as string
          // CFBundleName keeps the composed (NFC) form, not an NFD-decomposed one.
          expect(cfBundleName).toBe(productName)
          expect(cfBundleName).toBe(cfBundleName.normalize("NFC"))
          // The original product name is still used for display.
          expect(info.CFBundleDisplayName).toBe(productName)

          // The base helper bundle directory must be byte-for-byte `${cfBundleName} Helper.app`.
          const frameworks = await fs.readdir(path.join(appDir, "Contents", "Frameworks"))
          const baseHelper = frameworks.filter(entry => entry.endsWith(" Helper.app"))
          expect(baseHelper).toEqual([`${cfBundleName} Helper.app`])

          // The helper executable and its plist's CFBundleExecutable must stay in lockstep with the
          // renamed bundle, otherwise the helper process cannot launch.
          const helperContents = path.join(appDir, "Contents", "Frameworks", `${cfBundleName} Helper.app`, "Contents")
          await assertThat(expect, path.join(helperContents, "MacOS", `${cfBundleName} Helper`)).isFile()
          const helperInfo = await parsePlistFile<PlistObject>(path.join(helperContents, "Info.plist"))
          expect(helperInfo.CFBundleExecutable).toBe(`${cfBundleName} Helper`)
        },
      }
    )
  })

  test.ifMac("rejects a productName containing a path separator", ({ expect }) =>
    appThrows(
      expect,
      {
        targets: Platform.MAC.createTarget(DIR_TARGET, Arch.x64),
        config: {
          productName: "Bad/Name",
          mac: { notarize: false },
        },
      },
      {},
      error => expect(error.message).toContain("is not a valid macOS app bundle name")
    )
  )
})

describe("MacPackager.applyCommonInfo", () => {
  // `this` is only read for the app info, the icon and darkModeSupport, so a hand-rolled one is enough (cf. macPackagerDoSignTest)
  test("writes the flavor's own LSMinimumSystemVersion, category and extendInfo, not the mac ones", async ({ expect }) => {
    const self = {
      appInfo: { productFilename: "MyApp", productName: "MyApp", version: "1.0.0", buildVersion: "1.0.0", copyright: "Copyright" },
      platformSpecificBuildOptions: { minimumSystemVersion: "12.0", category: "public.app-category.developer-tools", extendInfo: { MacOnly: "mac" } },
      getIconPath: () => Promise.resolve(null),
    }
    const plist: Record<string, any> = {}
    const masOptions = { minimumSystemVersion: "13.0", category: "public.app-category.games", extendInfo: { MasOnly: "mas" } }
    await (MacPackager.prototype.applyCommonInfo as (this: unknown, ...args: any[]) => Promise<void>).call(self, plist, "/nonexistent/Contents", masOptions)
    expect(plist.LSMinimumSystemVersion).toBe("13.0")
    expect(plist.LSApplicationCategoryType).toBe("public.app-category.games")
    expect(plist.MasOnly).toBe("mas")
    expect(plist.MacOnly).toBeUndefined()
  })

  test("an empty category leaves LSApplicationCategoryType as it is", async ({ expect }) => {
    const self = {
      appInfo: { productFilename: "MyApp", productName: "MyApp", version: "1.0.0", buildVersion: "1.0.0", copyright: "Copyright" },
      platformSpecificBuildOptions: { category: "" },
      getIconPath: () => Promise.resolve(null),
    }
    const plist: Record<string, any> = { LSApplicationCategoryType: "public.app-category.developer-tools" }
    await (MacPackager.prototype.applyCommonInfo as (this: unknown, ...args: any[]) => Promise<void>).call(self, plist, "/nonexistent/Contents", { category: "" })
    expect(plist.LSApplicationCategoryType).toBe("public.app-category.developer-tools")
  })
})
