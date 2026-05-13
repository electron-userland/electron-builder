import { parseDn } from "builder-util-runtime"
import { WinPackager } from "app-builder-lib"
import { CustomWindowsSign } from "app-builder-lib/src/codeSign/windowsSignToolManager"
import { ToolsetConfig } from "app-builder-lib/src/configuration"
import { AsyncTaskManager } from "builder-util"
import { Arch, DIR_TARGET, Platform, Target } from "electron-builder"
import { Packager } from "electron-builder"
import { outputFile } from "fs-extra"
import { load } from "js-yaml"
import * as path from "path"
import { CheckingWinPackager } from "../helpers/CheckingPackager"
import { app, appThrows } from "../helpers/packTester"
import { ExpectStatic } from "vitest"

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

    test.skip("azure signing without credentials", ({ expect }) =>
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

describe("signingQueue recovery", () => {
  test("signs subsequent files after a transient rejection on one file", async ({ expect }) => {
    let callCount = 0
    const signedFiles: string[] = []
    const signIfResults: Array<{ file: string; ok: boolean }> = []

    const sign: CustomWindowsSign = async config => {
      callCount++
      if (path.basename(config.path) === "file2.exe") {
        throw new Error("transient signing error")
      }
      signedFiles.push(path.basename(config.path))
    }

    class SignQueueTestPackager extends WinPackager {
      constructor(info: Packager) {
        super(info)
      }

      async pack(outDir: string, _arch: Arch, _targets: Array<Target>, _taskManager: AsyncTaskManager): Promise<void> {
        const files = ["file1.exe", "file2.exe", "file3.exe"].map(f => path.join(outDir, f))
        await Promise.all(
          files.map(f =>
            this.signIf(f).then(
              () => signIfResults.push({ file: path.basename(f), ok: true }),
              () => signIfResults.push({ file: path.basename(f), ok: false })
            )
          )
        )
      }

      packageInDistributableFormat(_appOutDir: string, _arch: Arch, _targets: Array<Target>, _taskManager: AsyncTaskManager): void {}
    }

    await app(expect, {
      targets: Platform.WINDOWS.createTarget(DIR_TARGET),
      platformPackagerFactory: (info, _platform) => new SignQueueTestPackager(info),
      config: {
        toolsets: { winCodeSign: "1.1.0" },
        win: {
          signtoolOptions: {
            certificateFile: "secretFile",
            certificatePassword: "pass",
            sign,
            signingHashAlgorithms: ["sha256"],
          },
        },
      },
    })

    expect(callCount).toBe(3)
    expect(signedFiles).toContain("file1.exe")
    expect(signedFiles).not.toContain("file2.exe")
    expect(signedFiles).toContain("file3.exe")
    expect(signIfResults.find(r => r.file === "file2.exe")?.ok).toBe(false)
    expect(signIfResults.find(r => r.file === "file3.exe")?.ok).toBe(true)
  })
})
