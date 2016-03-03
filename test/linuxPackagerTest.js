import test from "./helpers/avaEx"
import { assertPack } from "./helpers/packTester"

test.ifNotWindows("linux", async function () {
  await assertPack("test-app-one", "linux")
})

test.ifNotWindows("no-author-email", async(t) => {
  t.throws(assertPack("test-app-no-author-email", "linux"), /Please specify author 'email' in .*/)
})
