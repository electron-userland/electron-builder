import test from "./helpers/avaEx"
import { assertPack, platform, modifyPackageJson } from "./helpers/packTester"
import { remove } from "fs-extra-p"
import * as path from "path"
import { Platform } from "out"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

test.ifNotWindows("deb", () => assertPack("test-app-one", platform(Platform.LINUX)))

test.ifDevOrLinuxCi("AppImage", () => assertPack("test-app-one", {
    targets: Platform.LINUX.createTarget("appimage"),
  }
))

// "apk" is very slow, don't test for now
test.ifDevOrLinuxCi("targets", () => assertPack("test-app-one", {
  targets: Platform.LINUX.createTarget(["sh", "freebsd", "pacman", "zip", "7z"]),
}))

test.ifDevOrLinuxCi("tar", () => assertPack("test-app-one", {
  targets: Platform.LINUX.createTarget(["tar.xz", "tar.lz", "tar.bz2"]),
}))

// https://github.com/electron-userland/electron-builder/issues/460
// for some reasons in parallel to fmp we cannot use tar
test.ifDevOrLinuxCi("rpm and tar.gz", () => assertPack("test-app-one", {
  targets: Platform.LINUX.createTarget(["rpm", "tar.gz"]),
}))

test.ifNotWindows("icons from ICNS", () => assertPack("test-app-one", {
  targets: Platform.LINUX.createTarget(),
}, {
  tempDirCreated: it => remove(path.join(it, "build", "icons"))
}))

test.ifNotWindows("custom depends", () => assertPack("test-app-one", {
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

test.ifNotWindows("no-author-email", t => {
  t.throws(assertPack("test-app-one", platform(Platform.LINUX), {
    tempDirCreated: projectDir => modifyPackageJson(projectDir, data => {
      data.author = "Foo"
    })
  }), /Please specify author 'email' in .+/)
})