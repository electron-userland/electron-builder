import BluebirdPromise from "bluebird-lst"
import { Arch, Platform } from "electron-builder"
import * as path from "path"
import { CheckingWinPackager } from "../helpers/CheckingPackager"
import { app, assertPack, copyTestAsset, modifyPackageJson } from "../helpers/packTester"

test.ifAll.ifNotCiMac("Squirrel.Windows", app({targets: Platform.WINDOWS.createTarget(["squirrel", "zip"])}, {signed: true}))

// very slow
test.skip("delta and msi", app({
  targets: Platform.WINDOWS.createTarget("squirrel", Arch.ia32),
  config: {
    squirrelWindows: {
      remoteReleases: "https://github.com/develar/__test-app-releases",
      msi: true,
    }
  },
}))

test.ifAll("detect install-spinner, certificateFile/password", () => {
  let platformPackager: CheckingWinPackager = null
  let loadingGifPath: string = null

  return assertPack("test-app-one", {
    targets: Platform.WINDOWS.createTarget("squirrel"),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingWinPackager(packager),
    config: {
      win: {
        certificatePassword: "pass",
      }
    }
  }, {
    projectDirCreated: it => {
      loadingGifPath = path.join(it, "build", "install-spinner.gif")
      return BluebirdPromise.all([
        copyTestAsset("install-spinner.gif", loadingGifPath),
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