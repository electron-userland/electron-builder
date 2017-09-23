import { DIR_TARGET, Platform } from "electron-builder"
import * as path from "path"
import { CheckingWinPackager } from "../helpers/CheckingPackager"
import { app, appThrows } from "../helpers/packTester"

describe.ifAll("sign", () => {
  const windowsDirTarget = Platform.WINDOWS.createTarget(["dir"])

  test.ifNotWindows("ev", appThrows({
    targets: windowsDirTarget,
    config: {
      win: {
        certificateSubjectName: "ev",
      }
    }
  }))

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
        }
      },
    })
  }

  test.ifNotCiMac("certificateFile/password - sign as function", testCustomSign(require("../helpers/customWindowsSign").default))
  test.ifNotCiMac("certificateFile/password - sign as path", testCustomSign(path.join(__dirname, "../helpers/customWindowsSign")))

  test.ifNotCiMac("custom sign if no code sign info", () => {
    let called = false
    return app({
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
    }, {
      packed: async () => {
        expect(called).toBe(true)
      }
    })()
  })

  test.ifNotWindows("certificateSha1", appThrows({
    targets: windowsDirTarget,
    config: {
      win: {
        certificateSha1: "boo",
      }
    }
  }))

  test.ifNotCiMac("forceCodeSigning", appThrows({
    targets: windowsDirTarget,
    config: {
      forceCodeSigning: true,
    }
  }))

  test.ifNotCiMac("electronDist", appThrows({
    targets: Platform.WINDOWS.createTarget(DIR_TARGET),
    config: {
      electronDist: "foo",
    }
  }))
})