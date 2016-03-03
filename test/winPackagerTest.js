import test from "./helpers/avaEx"
import { assertPack } from "./helpers/packTester"

test.ifNotTravis("win", async function () {
  await assertPack("test-app-one", "win32")
})

// nsis is deprecated and not thread-safe - just do not run on CI to avoid failures
test.ifNotCi.serial("win: nsis", async function () {
  await assertPack("test-app-one", "win32", {
    target: ["nsis"],
    arch: process.arch
  }, true)
})