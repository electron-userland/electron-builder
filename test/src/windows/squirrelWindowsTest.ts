import { Arch, Platform } from "electron-builder"
import * as path from "path"
import { CheckingWinPackager } from "../helpers/CheckingPackager"
import { app, assertPack, copyTestAsset } from "../helpers/packTester"

describe("squirrel.windows", { sequential: true }, () => {
  test.ifNotCiMac("Squirrel.Windows", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget(["squirrel"]),
        config: {
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
    )
  )

  test.ifNotCiMac("artifactName", ({ expect }) =>
    app(expect, {
      targets: Platform.WINDOWS.createTarget(["squirrel", "zip"]),
      config: {
        win: {
          // tslint:disable:no-invalid-template-strings
          artifactName: "Test ${name} foo.${ext}",
        },
      },
    })
  )

  // very slow
  test.skip("delta and msi", ({ expect }) =>
    app(expect, {
      targets: Platform.WINDOWS.createTarget("squirrel", Arch.ia32),
      config: {
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
          squirrelWindows: {
            msi: true,
          },
        },
      },
      { signedWin: true }
    ))

  test("squirrel window ia32 msi", ({ expect }) =>
    app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget("squirrel", Arch.ia32),
        config: {
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
        targets: Platform.WINDOWS.createTarget("squirrel"),
        platformPackagerFactory: (packager, platform) => (platformPackager = new CheckingWinPackager(packager)),
      },
      {
        projectDirCreated: it => {
          loadingGifPath = path.join(it, "build", "install-spinner.gif")
          return copyTestAsset("install-spinner.gif", loadingGifPath)
        },
        packed: async () => {
          expect(platformPackager!.effectiveDistOptions.loadingGif).toEqual(loadingGifPath)
        },
      }
    )
  })
})
