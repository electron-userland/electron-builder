import test from "./helpers/avaEx"
import { assertPack, platform, modifyPackageJson } from "./helpers/packTester"
import { remove } from "fs-extra-p"
import * as path from "path"
import { Platform } from "out"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifNotWindows("deb", () => assertPack("test-app-one", platform(Platform.LINUX)))

test.ifDevOrLinuxCi("targets", () => assertPack("test-app-one", {
  targets: Platform.LINUX.createTarget(),
  devMetadata: {
    build: {
      linux: {
        // "apk" is very slow, don't test for now
        target: ["sh", "freebsd", "pacman", "zip", "7z"],
      }
    }
  }
}))

test.ifDevOrLinuxCi("tar", () => assertPack("test-app-one", {
  targets: Platform.LINUX.createTarget(),
  devMetadata: {
    build: {
      linux: {
        target: ["tar.xz", "tar.lz", "tar.bz2"],
      }
    }
  }
}))

// https://github.com/electron-userland/electron-builder/issues/460
// for some reasons in parallel to fmp we cannot use tar
test.ifDevOrLinuxCi("rpm and tar.gz", () => assertPack("test-app-one", {
  targets: Platform.LINUX.createTarget(),
  devMetadata: {
    build: {
      linux: {
        target: ["rpm", "tar.gz"],
      }
    }
  }
}))

test.ifNotWindows("icons from ICNS", () => assertPack("test-app-one", {
  targets: Platform.LINUX.createTarget(),
}, {
  tempDirCreated: it => remove(path.join(it, "build", "icons"))
}))

test.ifNotWindows("custom configuration", () => assertPack("test-app-one", {
    targets: Platform.LINUX.createTarget(),
    devMetadata: {
      build: {
        linux: {
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
    tempDirCreated: projectDir => {
      return modifyPackageJson(projectDir, data => {
        data.author = "Foo"
      })
    }
  }), /Please specify author 'email' in .+/)
})