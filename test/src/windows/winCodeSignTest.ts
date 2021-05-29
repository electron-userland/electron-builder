import { DIR_TARGET, Platform } from "electron-builder"
import { outputFile } from "fs-extra"
import * as path from "path"
import { CheckingWinPackager } from "../helpers/CheckingPackager"
import { app, appThrows } from "../helpers/packTester"
import { parseDn } from "builder-util-runtime"
import { load } from "js-yaml"

test("parseDn", () => {
  expect(parseDn("CN=7digital Limited, O=7digital Limited, L=London, C=GB")).toMatchSnapshot()

  expect(load("publisherName:\n  - 7digital Limited")).toMatchObject({ publisherName: ["7digital Limited"] })
})

const windowsDirTarget = Platform.WINDOWS.createTarget(["dir"])

test.ifNotCiMac(
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
      projectDirCreated: async projectDir => {
        await outputFile(path.join(projectDir, "assets", "nested", "nested", "file.exe"), "invalid PE file")
      },
    },
    error => expect(error.message).toContain("Unrecognized file type:")
  )
)

function testCustomSign(sign: any) {
  return app({
    targets: Platform.WINDOWS.createTarget(DIR_TARGET),
    platformPackagerFactory: (packager, platform) => new CheckingWinPackager(packager),
    config: {
      win: {
        certificatePassword: "pass",
        certificateFile: "secretFile",
        sign,
        signingHashAlgorithms: ["sha256"],
        // to be sure that sign code will be executed
        forceCodeSigning: true,
      },
    },
  })
}

test.ifAll.ifNotCiMac(
  "certificateFile/password - sign as async/await",
  testCustomSign(async () => {
    return
  })
)
test.ifAll.ifNotCiMac(
  "certificateFile/password - sign as Promise",
  testCustomSign(() => Promise.resolve())
)
test.ifAll.ifNotCiMac("certificateFile/password - sign as function", testCustomSign(require("../helpers/customWindowsSign").default))
test.ifAll.ifNotCiMac("certificateFile/password - sign as path", testCustomSign(path.join(__dirname, "../helpers/customWindowsSign")))

test.ifAll.ifNotCiMac("custom sign if no code sign info", () => {
  let called = false
  return app(
    {
      targets: Platform.WINDOWS.createTarget(DIR_TARGET),
      platformPackagerFactory: (packager, platform) => new CheckingWinPackager(packager),
      config: {
        win: {
          // to be sure that sign code will be executed
          forceCodeSigning: true,
          sign: async () => {
            called = true
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

test.ifAll.ifNotCiMac(
  "forceCodeSigning",
  appThrows({
    targets: windowsDirTarget,
    config: {
      forceCodeSigning: true,
    },
  })
)

test.ifAll.ifNotCiMac(
  "electronDist",
  appThrows({
    targets: Platform.WINDOWS.createTarget(DIR_TARGET),
    config: {
      electronDist: "foo",
    },
  })
)
