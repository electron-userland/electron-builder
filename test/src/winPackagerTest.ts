import test from "./helpers/avaEx"
import { assertPack, platform } from "./helpers/packTester"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifNotTravis("win", async () => {
  await assertPack("test-app-one", platform("win32"))
})

// nsis is deprecated and not thread-safe - just do not run on CI to avoid failures
test.ifNotCi.serial("win: nsis", async () => {
  await assertPack("test-app-one", {
    platform: ["win32"],
    target: ["nsis"],
    arch: process.arch
  }, true)
})