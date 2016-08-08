import test from "./helpers/avaEx"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

const updater = require("../../nsis-auto-updater/out/nsis-auto-updater/src/nsis-updater")

test("Check updates - no latest version", async (t) => {
  //noinspection ReservedWordAsName
  updater.setFeedURL({
    user: "actperepo",
    package: "no-versions",
  })

  t.throws(updater.checkForUpdates(), /No latest version, please ensure that/)
})