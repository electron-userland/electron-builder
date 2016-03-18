import test from "./helpers/avaEx"
import { assertPack, platform } from "./helpers/packTester"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifNotTravis("win", async () => {
  await assertPack("test-app-one", platform("win32"))
})