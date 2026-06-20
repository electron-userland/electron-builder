import { ToolInfo, WindowsSignToolManager } from "app-builder-lib"
import { CustomWindowsSign, ToolsetConfig } from "app-builder-lib/internal"
import { DIR_TARGET, Platform } from "electron-builder"
import { outputFile } from "fs-extra"
import * as path from "path"
import type { ExpectStatic } from "vitest"
import { CheckingWinPackager } from "../helpers/CheckingPackager"
import { app, appThrows } from "../helpers/packTester"

const windowsDirTarget = Platform.WINDOWS.createTarget(["dir"])

export function registerWinCodeSignTests(toolsets: Partial<ToolsetConfig>): void {
  const { winCodeSign } = toolsets

  test("sign nested asar unpacked executables", ({ expect }) =>
    appThrows(
      expect,
      {
        targets: Platform.WINDOWS.createTarget(DIR_TARGET),
        config: {
          publish: "never",
          asar: { unpack: ["assets"] },
          toolsets: { winCodeSign },
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
          case "1.2.1":
          case "1.3.0":
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
        toolsets: { winCodeSign },
        win: {
          sign: {
            type: "signtool" as const,
            certificatePassword: "pass",
            certificateFile: "secretFile",
            sign,
            signingHashAlgorithms: ["sha256"],
          },
          forceCodeSigning: true,
        },
      },
    })
  }

  test("certificateFile/password - sign as async/await", ({ expect }) => testCustomSign(expect, async () => Promise.resolve()))
  test("certificateFile/password - sign as Promise", ({ expect }) => testCustomSign(expect, () => Promise.resolve()))
  test("certificateFile/password - sign as function", async ({ expect }) => testCustomSign(expect, (await import("../helpers/customWindowsSign")).default))
  test("certificateFile/password - sign as path", ({ expect }) => testCustomSign(expect, path.join(__dirname, "../helpers/customWindowsSign.mjs")))

  test("custom sign can call getToolPath() via packager.signingManager", ({ expect }) => {
    let capturedToolInfo: ToolInfo | null = null
    const sign: CustomWindowsSign = async (_config, packager) => {
      const manager = (await packager!.signingManager.value) as WindowsSignToolManager
      capturedToolInfo = await manager.getToolPath(process.platform === "win32")
    }
    return app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget(DIR_TARGET),
        platformPackagerFactory: (packager, _platform) => new CheckingWinPackager(packager),
        config: {
          toolsets: { winCodeSign },
          win: {
            forceCodeSigning: true,
            sign: {
              type: "signtool" as const,
              certificatePassword: "pass",
              certificateFile: "secretFile",
              sign,
              signingHashAlgorithms: ["sha256"],
            },
          },
        },
      },
      {
        packed: () => {
          expect(capturedToolInfo).not.toBeNull()
          expect(typeof capturedToolInfo!.path).toBe("string")
          expect(capturedToolInfo!.path.length).toBeGreaterThan(0)
          return Promise.resolve()
        },
      }
    )
  })

  test("custom sign if no code sign info", ({ expect }) => {
    let called = false
    return app(
      expect,
      {
        targets: Platform.WINDOWS.createTarget(DIR_TARGET),
        platformPackagerFactory: (packager, _platform) => new CheckingWinPackager(packager),
        config: {
          toolsets: { winCodeSign },
          win: {
            forceCodeSigning: true,
            sign: {
              type: "signtool" as const,
              sign: async () => {
                called = true
                return Promise.resolve()
              },
            },
          },
        },
      },
      {
        packed: () => {
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
        toolsets: { winCodeSign },
        forceCodeSigning: true,
      },
    }))

  test("electronDist", ({ expect }) =>
    appThrows(
      expect,
      {
        targets: windowsDirTarget,
        config: {
          toolsets: { winCodeSign },
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
          toolsets: { winCodeSign },
          win: {
            sign: {
              type: "azure" as const,
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
          toolsets: { winCodeSign },
        },
      },
      { signedWin: true }
    )
  )
}
