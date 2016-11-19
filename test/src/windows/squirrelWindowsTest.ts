import { Platform, Arch } from "out"
import { app, modifyPackageJson, appThrows, getTestAsset, assertPack, CheckingWinPackager } from "../helpers/packTester"
import * as path from "path"
import BluebirdPromise from "bluebird-lst-c"
import { copy } from "fs-extra-p"

test.ifNotCiMac("Squirrel.Windows", app({targets: Platform.WINDOWS.createTarget(["squirrel", "zip"])}, {signed: true}))

// very slow
test.skip("delta and msi", app({
  targets: Platform.WINDOWS.createTarget("squirrel", Arch.ia32),
  devMetadata: {
    build: {
      squirrelWindows: {
        remoteReleases: "https://github.com/develar/__test-app-releases",
        msi: true,
      },
    }
  },
}))

test.ifNotCiMac("msi as string", appThrows(/msi expected to be boolean value, but string '"false"' was specified/, {targets: Platform.WINDOWS.createTarget("squirrel")}, {
  projectDirCreated: it => modifyPackageJson(it, data => {
    data.build.win = {
      msi: "false",
    }
  })
}))

test("detect install-spinner, certificateFile/password", () => {
  let platformPackager: CheckingWinPackager = null
  let loadingGifPath: string = null

  return assertPack("test-app-one", {
    targets: Platform.WINDOWS.createTarget("squirrel"),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingWinPackager(packager),
    devMetadata: {
      build: {
        win: {
          certificatePassword: "pass",
        }
      }
    }
  }, {
    projectDirCreated: it => {
      loadingGifPath = path.join(it, "build", "install-spinner.gif")
      return BluebirdPromise.all([
        copy(getTestAsset("install-spinner.gif"), loadingGifPath),
        modifyPackageJson(it, data => {
          data.build.win = {
            certificateFile: "secretFile",
            certificatePassword: "mustBeOverridden",
          }
        })])
    },
    packed: async () => {
      expect(platformPackager.effectiveDistOptions.loadingGif).toEqual(loadingGifPath)
      expect(platformPackager.signOptions.cert).toEqual("secretFile")
      expect(platformPackager.signOptions.password).toEqual("pass")
    },
  })
})