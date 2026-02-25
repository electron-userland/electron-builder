import { Arch, Platform } from "electron-builder"
import * as fs from "fs"
import { app } from "../helpers/packTester"
import { ToolsetConfig } from "app-builder-lib"

const winCodeSignVersions: ToolsetConfig["winCodeSign"][] = ["0.0.0", "1.0.0", "1.1.0"]
const target = Platform.WINDOWS.createTarget("msi", Arch.x64)

describe.ifWindows("msi", { sequential: true }, () => {
  for (const winCodeSign of winCodeSignVersions) {
    describe(`winCodeSign: ${winCodeSign}`, () => {
      const toolsets: ToolsetConfig = {
        winCodeSign,
      }
      test("msi", ({ expect }) =>
        app(
          expect,
          {
            targets: target,
            config: {
              toolsets,
              appId: "build.electron.test.msi.oneClick.perMachine",
              extraMetadata: {
                // version: "1.0.0",
              },
              productName: "Test MSI",
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
            // signed: true,
          }
        ))

      test("msi no asar", ({ expect }) =>
        app(
          expect,
          {
            targets: target,
            config: {
              toolsets,
              appId: "build.electron.test.msi.oneClick.perMachine",
              extraMetadata: {
                // version: "1.0.0",
              },
              productName: "Test MSI",
              asar: false,
            },
          },
          {
            // signed: true,
          }
        ))

      test("per-user", ({ expect }) =>
        app(
          expect,
          {
            targets: target,
            config: {
              toolsets,
              appId: "build.electron.test.msi.oneClick.perUser",
              extraMetadata: {
                // version: "1.0.0",
              },
              productName: "Test MSI Per User",
              msi: {
                perMachine: false,
              },
            },
          },
          {
            // signed: true,
          }
        ))

      const wixArgsProductName = "Test WiX Args"
      test("wix args", ({ expect }) =>
        app(
          expect,
          {
            targets: target,
            config: {
              toolsets,
              appId: "build.electron.test.msi.oneClick.wixArgs",
              extraMetadata: {
                // version: "1.0.0",
              },
              productName: wixArgsProductName,
              // Inject a custom-action which requires the WixUtilExtension DLL
              msiProjectCreated: async path => {
                await fs.promises.writeFile(
                  path,
                  (await fs.promises.readFile(path, "utf8")).replace(
                    "</Product>",
                    `<util:CloseApplication xmlns:util="http://wixtoolset.org/schemas/v4/wxs/util"
              PromptToContinue="no"
              Target="${wixArgsProductName}.exe"
              CloseMessage="yes"
              Timeout="2"
              TerminateProcess="1"
              RebootPrompt="no"
            />
            </Product>`
                  )
                )
              },
              msi: {
                // Apply the needed DLL
                additionalWixArgs: ["-ext", "WixUtilExtension"],
              },
            },
          },
          {
            // signed: true,
          }
        ))

      test.skip("assisted", ({ expect }) =>
        app(expect, {
          targets: target,
          config: {
            toolsets,
            appId: "build.electron.test.msi.assisted",
            extraMetadata: {
              // version: "1.0.0",
            },
            productName: "Test MSI Assisted",
            // test lzx (currently, doesn't work on wine)
            compression: "maximum",
            msi: {
              oneClick: false,
              menuCategory: "TestMenuDirectory",
            },
          },
        }))
    })
  }
})
