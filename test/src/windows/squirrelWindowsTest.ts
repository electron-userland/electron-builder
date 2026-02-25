import { Arch, Platform } from "electron-builder"
import * as path from "path"
import { CheckingWinPackager } from "../helpers/CheckingPackager"
import { app, assertPack, copyTestAsset } from "../helpers/packTester"
import { ToolsetConfig } from "app-builder-lib"

const winCodeSignVersions: ToolsetConfig["winCodeSign"][] = ["0.0.0", "1.0.0", "1.1.0"]

describe.ifWindows("squirrel-windows", { sequential: true }, () => {
  for (const winCodeSign of winCodeSignVersions) {
    describe(`winCodeSign: ${winCodeSign}`, () => {
      const toolsets: ToolsetConfig = {
        winCodeSign,
      }
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
    })
  }
})
