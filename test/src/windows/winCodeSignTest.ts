import { parseDn } from "builder-util-runtime"
import { DIR_TARGET, Platform } from "electron-builder"
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

test("sign nested asar unpacked executables", ({ expect }) =>
  appThrows(
    expect,
    {
      targets: Platform.WINDOWS.createTarget(DIR_TARGET),
      config: {
        publish: "never",
        asarUnpack: ["assets"],
      },
    },
    {
      signedWin: true,
      projectDirCreated: async projectDir => {
        await outputFile(path.join(projectDir, "assets", "nested", "nested", "file.exe"), "invalid PE file")
      },
    },
    error => {
      if (process.platform === "win32") {
        expect(error.message).toContain("This file format cannot be signed because it is not recognized.")
      } else {
        expect(error.message).toContain("Unrecognized file type")
      }
    }
  ))

function testCustomSign(expect: ExpectStatic, sign: any) {
  return app(expect, {
    targets: Platform.WINDOWS.createTarget(DIR_TARGET),
    platformPackagerFactory: (packager, platform) => new CheckingWinPackager(packager),
    config: {
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
      platformPackagerFactory: (packager, platform) => new CheckingWinPackager(packager),
      config: {
        win: {
          // to be sure that sign code will be executed
          forceCodeSigning: true,
          signtoolOptions: {
            sign: async () => {
              called = true
            },
          },
        },
      },
    },
    {
      packed: async () => {
        expect(called).toBe(true)
      },
    }
  )
})

test("forceCodeSigning", ({ expect }) =>
  appThrows(expect, {
    targets: windowsDirTarget,
    config: {
      forceCodeSigning: true,
    },
  }))

test("electronDist", ({ expect }) =>
  appThrows(expect, {
    targets: windowsDirTarget,
    config: {
      electronDist: "foo",
    },
  }))

test("azure signing without credentials", ({ expect }) =>
  appThrows(
    expect,
    {
      targets: windowsDirTarget,
      config: {
        forceCodeSigning: true,
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
    },
    {
      signedWin: true,
    }
  )
)
