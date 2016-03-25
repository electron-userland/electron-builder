import test from "./helpers/avaEx"
import { assertPack, platform } from "./helpers/packTester"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifOsx("mac: two-package.json", () => {
  return assertPack("test-app", {
    platform: ["darwin"],
    arch: "all",
  })
})

test.ifOsx("mac: one-package.json", () => {
  return assertPack("test-app-one", platform("darwin"))
})