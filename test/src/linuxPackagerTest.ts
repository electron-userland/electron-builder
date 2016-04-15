import test from "./helpers/avaEx"
import { assertPack, platform, modifyPackageJson } from "./helpers/packTester"
import { remove } from "fs-extra-p"
import * as path from "path"
import { Platform } from "out"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifNotWindows("linux", async () => {
  await assertPack("test-app-one", platform(Platform.LINUX))
})

test.ifNotWindows("linux - icons from ICNS", async () => {
  await assertPack("test-app-one", {
    platform: [Platform.LINUX],
  }, {tempDirCreated: (projectDir) => remove(path.join(projectDir, "build", "icons"))})
})

test.ifNotWindows("no-author-email", t => {
  t.throws(assertPack("test-app-one", platform(Platform.LINUX), {
    tempDirCreated: projectDir => {
      return modifyPackageJson(projectDir, data => {
        data.author = "Foo"
      })
    }
  }), /Please specify author 'email' in .+/)
})