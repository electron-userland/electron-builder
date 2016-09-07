import test from "./helpers/avaEx"
import { modifyPackageJson, app, appThrows } from "./helpers/packTester"
import { remove } from "fs-extra-p"
import * as path from "path"
import { Platform } from "out"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

test.ifNotWindows("deb", app({targets: Platform.LINUX.createTarget("deb")}))

test.ifDevOrLinuxCi("AppImage", app({targets: Platform.LINUX.createTarget()}))

test.ifDevOrLinuxCi("AppImage - default icon", app({targets: Platform.LINUX.createTarget("appimage")}, {
  projectDirCreated: projectDir => remove(path.join(projectDir, "build"))
}))

// "apk" is very slow, don't test for now
test.ifDevOrLinuxCi("targets", app({targets: Platform.LINUX.createTarget(["sh", "freebsd", "pacman", "zip", "7z"])}))

test.ifDevOrLinuxCi("tar", app({targets: Platform.LINUX.createTarget(["tar.xz", "tar.lz", "tar.bz2"])}))

// https://github.com/electron-userland/electron-builder/issues/460
// for some reasons in parallel to fmp we cannot use tar
test.ifDevOrLinuxCi("rpm and tar.gz", app({targets: Platform.LINUX.createTarget(["rpm", "tar.gz"])}))

test.ifNotWindows("icons from ICNS", app({targets: Platform.LINUX.createTarget()}, {
  projectDirCreated: it => remove(path.join(it, "build", "icons"))
}))

test.ifNotWindows("custom depends", app({
    targets: Platform.LINUX.createTarget("deb"),
    devMetadata: {
      build: {
        deb: {
          depends: ["foo"],
        }
      }
    }
  },
  {
    expectedDepends: "foo"
  }))

test.ifNotWindows("no-author-email", appThrows(/Please specify author 'email' in .+/, {targets: Platform.LINUX.createTarget("deb")}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.author = "Foo"
  })
}))