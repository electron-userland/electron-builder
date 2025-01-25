import { DIR_TARGET, Platform } from "electron-builder"
import {} from "node:fs/promises"
import * as path from "path"
import { CheckingWinPackager } from "../helpers/CheckingPackager"
import { app, appThrows } from "../helpers/packTester"
import { parseDn } from "builder-util-runtime"
import { load } from "js-yaml"
import { outputFile } from "builder-util"

test("parseDn", () => {
  expect(parseDn("CN=7digital Limited, O=7digital Limited, L=London, C=GB")).toMatchSnapshot()

  expect(load("publisherName:\n  - 7digital Limited")).toMatchObject({ publisherName: ["7digital Limited"] })
})

const windowsDirTarget = Platform.WINDOWS.createTarget(["dir"])

test.ifAll(
  "sign nested asar unpacked executables",
  appThrows(
    {
      targets: Platform.WINDOWS.createTarget(DIR_TARGET),
      config: {
        publish: "never",
        asarUnpack: ["assets"],
      },
    },
    {
      signedWin: true,
      projectDirCreated: async projectDir => outputFile(path.join(projectDir, "assets", "nested", "nested", "file.exe"), "invalid PE file")
    },
    error => {
      if (process.platform === "win32") {
        expect(error.message).toContain("This file format cannot be signed because it is not recognized.")
      } else {
        expect(error.message).toContain("Unrecognized file type")
      }
    }
  )
)

function testCustomSign(sign: any) {
  return app({
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

test.ifAll(
  "certificateFile/password - sign as async/await",
  testCustomSign(async () => {
    return
  })
)
test.ifAll(
  "certificateFile/password - sign as Promise",
  testCustomSign(() => Promise.resolve())
)
test.ifAll("certificateFile/password - sign as function", testCustomSign(require("../helpers/customWindowsSign").default))
test.ifAll("certificateFile/password - sign as path", testCustomSign(path.join(__dirname, "../helpers/customWindowsSign")))

test.ifAll("custom sign if no code sign info", () => {
  let called = false
  return app(
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
  )()
})

test.ifAll(
  "forceCodeSigning",
  appThrows({
    targets: windowsDirTarget,
    config: {
      forceCodeSigning: true,
    },
  })
)

test.ifAll(
  "electronDist",
  appThrows({
    targets: windowsDirTarget,
    config: {
      electronDist: "foo",
    },
  })
)

test.ifAll(
  "azure signing without credentials",
  appThrows(
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
  )
)

test.ifNotWindows(
  "win code sign using pwsh",
  app(
    {
      targets: Platform.WINDOWS.createTarget(DIR_TARGET),
    },
    {
      signedWin: true,
    }
  )
)
