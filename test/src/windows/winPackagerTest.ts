import { Platform } from "out"
import { assertPack, platform, modifyPackageJson, app, appThrows, CheckingWinPackager } from "../helpers/packTester"
import { outputFile, rename } from "fs-extra-p"
import * as path from "path"
import BluebirdPromise from "bluebird-lst-c"

test.ifDevOrWinCi("beta version", app({
  targets: Platform.WINDOWS.createTarget(["squirrel", "nsis"]),
  devMetadata: <any>{
    version: "3.0.0-beta.2",
  }
}))

test.ifNotCiMac("icon < 256", appThrows(/Windows icon size must be at least 256x256, please fix ".+/, platform(Platform.WINDOWS), {
  projectDirCreated: projectDir => rename(path.join(projectDir, "build", "incorrect.ico"), path.join(projectDir, "build", "icon.ico"))
}))

test.ifNotCiMac("icon not an image", appThrows(/Windows icon is not valid ico file, please fix ".+/, platform(Platform.WINDOWS), {
  projectDirCreated: projectDir => outputFile(path.join(projectDir, "build", "icon.ico"), "foo")
}))

test.ifMac("custom icon", () => {
  let platformPackager: CheckingWinPackager = null
  return assertPack("test-app-one", {
    targets: Platform.WINDOWS.createTarget("squirrel"),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingWinPackager(packager)
  }, {
    projectDirCreated: projectDir => BluebirdPromise.all([
      rename(path.join(projectDir, "build", "icon.ico"), path.join(projectDir, "customIcon.ico")),
      modifyPackageJson(projectDir, data => {
        data.build.win = {
          icon: "customIcon"
        }
      })
    ]),
    packed: async context => {
      expect(await platformPackager.getIconPath()).toEqual(path.join(context.projectDir, "customIcon.ico"))
    },
  })
})

it.ifDevOrLinuxCi("ev", appThrows(/certificateSubjectName supported only on Windows/, {
  targets: Platform.WINDOWS.createTarget(["dir"]),
  devMetadata: {
    build: {
      win: {
        certificateSubjectName: "ev",
      }
    }
  }
}))