import { Platform } from "electron-builder"
import { rename, unlink, writeFile } from "fs-extra-p"
import * as path from "path"
import { app, appThrows, assertPack, CheckingWinPackager, platform } from "../helpers/packTester"

test.ifWinCi("beta version", app({
  targets: Platform.WINDOWS.createTarget(["squirrel", "nsis"]),
  appMetadata: {
    version: "3.0.0-beta.2",
  }
}))

test.ifNotCiMac("icon < 256", appThrows(platform(Platform.WINDOWS), {
  projectDirCreated: projectDir => rename(path.join(projectDir, "build", "incorrect.ico"), path.join(projectDir, "build", "icon.ico"))
}))

test.ifNotCiMac("icon not an image", appThrows(platform(Platform.WINDOWS), {
  projectDirCreated: async (projectDir) => {
    const file = path.join(projectDir, "build", "icon.ico")
    // because we use hardlinks
    await unlink(file)
    await writeFile(file, "foo")
  }
}))

test.ifMac("custom icon", () => {
  let platformPackager: CheckingWinPackager = null
  return assertPack("test-app-one", {
    targets: Platform.WINDOWS.createTarget("squirrel"),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingWinPackager(packager),
    config: {
      win: {
        icon: "customIcon"
      },
    }
  }, {
    projectDirCreated: projectDir => rename(path.join(projectDir, "build", "icon.ico"), path.join(projectDir, "customIcon.ico")),
    packed: async context => {
      expect(await platformPackager.getIconPath()).toEqual(path.join(context.projectDir, "customIcon.ico"))
    },
  })
})

it.ifDevOrLinuxCi("ev", appThrows({
  targets: Platform.WINDOWS.createTarget(["dir"]),
  config: {
    win: {
      certificateSubjectName: "ev",
    }
  }
}))

it.ifDevOrLinuxCi("forceCodeSigning", appThrows({
  targets: Platform.WINDOWS.createTarget(["dir"]),
  config: {
    forceCodeSigning: true,
  }
}))