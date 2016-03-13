import test from "./helpers/avaEx"
import { assertPack, platform } from "./helpers/packTester"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifNotWindows("linux", async () => {
  await assertPack("test-app-one", platform("linux"))
})

test.ifNotWindows("no-author-email", async (t) => {
  t.throws(assertPack("no-author-email", platform("linux")), /Please specify author 'email' in .*/)
})
