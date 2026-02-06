import { parseDn } from "builder-util-runtime"
import { DIR_TARGET, Platform } from "electron-builder"
import { outputFile } from "fs-extra"
import { load } from "js-yaml"
import * as path from "path"
import { CheckingWinPackager } from "../helpers/CheckingPackager"
import { app, appThrows } from "../helpers/packTester"
import { ExpectStatic } from "vitest"
import { ToolsetConfig } from "app-builder-lib/src/configuration"

test("parseDn", ({ expect }) => {
  expect(parseDn("CN=7digital Limited, O=7digital Limited, L=London, C=GB")).toMatchSnapshot()

  expect(load("publisherName:\n  - 7digital Limited")).toMatchObject({ publisherName: ["7digital Limited"] })
})

const windowsDirTarget = Platform.WINDOWS.createTarget(["dir"])

const winCodeSignVersions: ToolsetConfig["winCodeSign"][] = ["0.0.0", "1.0.0", "1.1.0"]

for (const winCodeSign of winCodeSignVersions) {
  describe(`winCodeSign: ${winCodeSign}`, { sequential: true }, () => {
    test("sign nested asar unpacked executables", ({ expect }) =>
      appThrows(
        expect,
        {
          targets: Platform.WINDOWS.createTarget(DIR_TARGET),
          config: {
            publish: "never",
            asarUnpack: ["assets"],
            toolsets: {
              winCodeSign,
            },
          },
        },
        {
          signedWin: true,
          projectDirCreated: async projectDir => {
            await outputFile(path.join(projectDir, "assets", "nested", "nested", "file.exe"), "invalid PE file")
          },
        },
        error => {
          let message = "This file format cannot be signed because it is not recognized."
          switch (winCodeSign) {
            case "0.0.0":
              if (process.platform !== "win32") {
                message = "Unrecognized file type:"
              }
              break
            case "1.0.0":
            case "1.1.0":
              if (process.platform !== "win32") {
                message = "Initialization error or unsupported input file type."
              }
              break
          }
          expect(error.message).toContain(message)
        }
      ))

    function testCustomSign(expect: ExpectStatic, sign: any) {
      return app(expect, {
        targets: Platform.WINDOWS.createTarget(DIR_TARGET),
        platformPackagerFactory: (packager, _platform) => new CheckingWinPackager(packager),
        config: {
          toolsets: {
            winCodeSign,
          },
          win: {
            signtoolOptions: {
              certificatePassword: "pass",
              certificateFile: "secretFile",
              sign,
              signingHashAlgorithms: ["sha256"],
            },
            // to be sure that sign code will be executed
            forceCodeSigning: true,
          },
        },
      })
    }

    test("certificateFile/password - sign as async/await", ({ expect }) =>
      testCustomSign(expect, async () => {
        return Promise.resolve()
      }))
    test("certificateFile/password - sign as Promise", ({ expect }) => testCustomSign(expect, () => Promise.resolve()))
    test("certificateFile/password - sign as function", async ({ expect }) => testCustomSign(expect, (await import("../helpers/customWindowsSign")).default))
    test("certificateFile/password - sign as path", ({ expect }) => testCustomSign(expect, path.join(__dirname, "../helpers/customWindowsSign.mjs")))

    test("custom sign if no code sign info", ({ expect }) => {
      let called = false
      return app(
        expect,
        {
          targets: Platform.WINDOWS.createTarget(DIR_TARGET),
          platformPackagerFactory: (packager, _platform) => new CheckingWinPackager(packager),
          config: {
            toolsets: {
              winCodeSign,
            },
            win: {
              // to be sure that sign code will be executed
              forceCodeSigning: true,
              signtoolOptions: {
                sign: async () => {
                  called = true
                  return Promise.resolve()
                },
              },
            },
          },
        },
        {
          packed: async () => {
            expect(called).toBe(true)
            return Promise.resolve()
          },
        }
      )
    })

    test("forceCodeSigning", ({ expect }) =>
      appThrows(expect, {
        targets: windowsDirTarget,
        config: {
          toolsets: {
            winCodeSign,
          },
          forceCodeSigning: true,
        },
      }))

    test("electronDist", ({ expect }) =>
      appThrows(
        expect,
        {
          targets: windowsDirTarget,
          config: {
            toolsets: {
              winCodeSign,
            },
            electronDist: "foo",
          },
        },
        {},
        error => expect(error.message).toContain("Please provide a valid path to the Electron zip file, cache directory, or electron build directory.")
      ))

    test("azure signing without credentials", ({ expect }) =>
      appThrows(
        expect,
        {
          targets: windowsDirTarget,
          config: {
            forceCodeSigning: true,
            toolsets: {
              winCodeSign,
            },
            win: {
              azureSignOptions: {
                publisherName: "test",
                endpoint: "https://weu.codesigning.azure.net/",
                certificateProfileName: "profilenamehere",
                codeSigningAccountName: "codesigningnamehere",
              },
            },
          },
        },
        {},
        error => expect(error.message).toContain("Unable to find valid azure env field AZURE_TENANT_ID for signing.")
      ))

    test.ifNotWindows("win code sign using pwsh", ({ expect }) =>
      app(
        expect,
        {
          targets: Platform.WINDOWS.createTarget(DIR_TARGET),
          config: {
            toolsets: {
              winCodeSign,
            },
          },
        },
        {
          signedWin: true,
        }
      )
    )
  })
}
