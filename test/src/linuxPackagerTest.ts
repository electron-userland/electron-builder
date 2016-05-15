import test from "./helpers/avaEx"
import { assertPack, platform, modifyPackageJson } from "./helpers/packTester"
import { remove } from "fs-extra-p"
import * as path from "path"
import { Platform } from "out"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifNotWindows("linux", () => assertPack("test-app-one", platform(Platform.LINUX)))

test.ifNotWindows("icons from ICNS", () => assertPack("test-app-one", {
  platform: [Platform.LINUX],
}, {
  tempDirCreated: it => remove(path.join(it, "build", "icons"))
}))

test.ifNotWindows("custom configuration", () => assertPack("test-app-one", {
    platform: [Platform.LINUX],
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