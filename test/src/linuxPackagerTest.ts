import test from "./helpers/avaEx"
import { assertPack, platform } from "./helpers/packTester"
import { remove } from "fs-extra-p"
import * as path from "path"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifNotWindows("linux", async () => {
  await assertPack("test-app-one", platform("linux"))
})

test.ifNotWindows("linux - icons from ICNS", async () => {
  await assertPack("test-app-one", {
    platform: ["linux"],
    arch: process.arch,
  }, (projectDir) => remove(path.join(projectDir, "build", "icons")))
})

test.ifNotWindows("no-author-email", async (t) => {
  t.throws(assertPack("no-author-email", platform("linux")), /Please specify author 'email' in .*/)
})
