import test from "./helpers/avaEx"
import { assertPack } from "./helpers/packTester"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifNotWindows("linux", async () => {
  await assertPack("test-app-one", "linux")
})

test.ifNotWindows("no-author-email", async (t) => {
  t.throws(assertPack("no-author-email", "linux"), /Please specify author 'email' in .*/)
})
