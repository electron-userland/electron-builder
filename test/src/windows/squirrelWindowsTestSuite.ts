import { Arch, Platform } from "electron-builder"
import { readdir } from "fs/promises"
import * as path from "path"
import { CheckingWinPackager } from "../helpers/CheckingPackager"
import { app, appThrows, assertPack, copyTestAsset } from "../helpers/packTester"
import { ToolsetConfig } from "app-builder-lib"

export function registerSquirrelWindowsTests(toolsets: ToolsetConfig): void {
  test("Squirrel.Windows", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget(["squirrel"], Arch.x64),
        config: {
          toolsets,
          win: {
            compression: "normal",
          },
          executableName: "test with spaces",
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
      { signedWin: true }
    ))

  test("artifactName", ({ expect }) =>
    app(expect, {
      targets: Platform.WINDOWS.createTarget(["squirrel", "zip"], Arch.x64),
      config: {
        toolsets,
        win: {
          // tslint:disable:no-invalid-template-strings
          artifactName: "Test ${name} foo.${ext}",
        },
      },
    }))

  // very slow
  test.skip("delta and msi", ({ expect }) =>
    app(expect, {
      targets: Platform.WINDOWS.createTarget("squirrel", Arch.ia32),
      config: {
        toolsets,
        squirrelWindows: {
          remoteReleases: "https://github.com/develar/__test-app-releases",
          msi: true,
        },
      },
    }))

  test("squirrel window arm64 msi", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget("squirrel", Arch.arm64),
        config: {
          toolsets,
          squirrelWindows: {
            msi: true,
          },
        },
      },
      { signedWin: true }
    ))

  test("squirrel window x64 msi", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget("squirrel", Arch.x64),
        config: {
          toolsets,
          squirrelWindows: {
            msi: true,
          },
        },
      },
      { signedWin: true }
    ))

  test("squirrel window x64 no msi", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget("squirrel", Arch.x64),
        config: {
          toolsets,
          squirrelWindows: {
            msi: false,
          },
        },
      },
      {
        signedWin: true,
        packed: async context => {
          const files = await readdir(path.join(context.outDir, "squirrel-windows"))
          expect(files.filter(it => it.endsWith(".msi"))).toEqual([])
          expect(files).toContain("Test App ßW Setup 1.1.0.exe")
        },
      }
    ))

  test("squirrel window ia32 msi", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget("squirrel", Arch.ia32),
        config: {
          toolsets,
          squirrelWindows: {
            msi: true,
          },
        },
      },
      { signedWin: true }
    ))

  test("detect install-spinner", ({ expect }) => {
    let platformPackager: CheckingWinPackager | null = null
    let loadingGifPath: string | null = null

    return assertPack(
      expect,
      "test-app-one",
      {
        targets: Platform.WINDOWS.createTarget("squirrel", Arch.x64),
        platformPackagerFactory: (packager, _platform) => (platformPackager = new CheckingWinPackager(packager)),
      },
      {
        projectDirCreated: it => {
          loadingGifPath = path.join(it, "build", "install-spinner.gif")
          return copyTestAsset("install-spinner.gif", loadingGifPath)
        },
        packed: async () => {
          expect(platformPackager!.effectiveDistOptions.loadingGif).toEqual(loadingGifPath)
          return Promise.resolve()
        },
      }
    )
  })

  test("useAppIdAsId and explicit loadingGif", ({ expect }) => {
    let platformPackager: CheckingWinPackager | null = null
    let loadingGifPath: string | null = null

    return assertPack(
      expect,
      "test-app-one",
      {
        targets: Platform.WINDOWS.createTarget("squirrel", Arch.x64),
        platformPackagerFactory: (packager, _platform) => (platformPackager = new CheckingWinPackager(packager)),
        config: {
          toolsets,
          squirrelWindows: {
            useAppIdAsId: true,
            loadingGif: "build/custom-spinner.gif",
          },
        },
      },
      {
        projectDirCreated: it => {
          loadingGifPath = path.join(it, "build", "custom-spinner.gif")
          return copyTestAsset("install-spinner.gif", loadingGifPath)
        },
        packed: async () => {
          const effectiveDistOptions = platformPackager!.effectiveDistOptions
          // nupkg id follows appId (test-app-one/package.json build.appId) instead of the package name
          expect(effectiveDistOptions.name).toEqual("org.electron-builder.testApp")
          expect(effectiveDistOptions.loadingGif).toEqual(loadingGifPath)
          return Promise.resolve()
        },
      }
    )
  })

  test("iconUrl not specified", ({ expect }) =>
    appThrows(
      expect,
      {
        targets: Platform.WINDOWS.createTarget("squirrel", Arch.x64),
        config: {
          toolsets,
          squirrelWindows: {
            // test-app-one/package.json sets iconUrl; unset it. The fixture has no repository, so no GitHub fallback URL can be derived.
            iconUrl: null,
          },
        },
      },
      {},
      error => expect(error.message).toContain("squirrelWindows.iconUrl is not specified")
    ))
}
