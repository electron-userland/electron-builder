import { modifyPackageJson, app, appThrows } from "../helpers/packTester"
import { remove } from "fs-extra-p"
import * as path from "path"
import { Platform } from "out"

test.ifDevOrLinuxCi("AppImage", app({targets: Platform.LINUX.createTarget()}))

// test.ifNotCi("snap", app({targets: Platform.LINUX.createTarget("snap")}))

test.ifDevOrLinuxCi("AppImage - default icon", app({
  targets: Platform.LINUX.createTarget("appimage"),
  devMetadata: {
    build: {
      linux: {
       executableName: "foo",
      }
    }
  }
}, {
  projectDirCreated: projectDir => remove(path.join(projectDir, "build"))
}))

test.ifNotWindows("icons from ICNS", app({targets: Platform.LINUX.createTarget()}, {
  projectDirCreated: it => remove(path.join(it, "build", "icons"))
}))

test.ifNotWindows("no-author-email", appThrows(/Please specify author 'email' in .+/, {targets: Platform.LINUX.createTarget("deb")}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.author = "Foo"
  })
}))