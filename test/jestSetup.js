"use strict"

require('source-map-support').install()
const isCi = require("is-ci")

const isWindows = process.platform === "win32"

// Squirrel.Windows msi is very slow
jasmine.DEFAULT_TIMEOUT_INTERVAL = (isWindows ? 30 : 10) * 1000 * 60

const skip = test.skip

if (process.env.RUN_IN_BAND !== "true") {
  //noinspection JSUnresolvedVariable
  // it = it.concurrent
  //noinspection JSUnresolvedVariable
  // test = it
}

test.ifMac = process.platform === "darwin" ? test : skip
test.ifNotWindows = isWindows ? skip : test

if (isCi) {
  test.ifCi = test
  test.ifNotCi = skip
}
else {
  test.ifCi = skip
  test.ifNotCi = test
}

test.ifNotCiMac = isCi && process.platform === "darwin" ? skip : test
test.ifNotCiWin = isCi && isWindows ? skip : test

test.ifDevOrWinCi = !isCi || isWindows ? test : skip
test.ifDevOrLinuxCi = !isCi || process.platform === "linux" ? test : skip
test.ifWinCi = isCi && isWindows ? test : skip

delete process.env.CSC_NAME
process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false"
if (!process.env.USE_HARD_LINKS) {
  process.env.USE_HARD_LINKS = "true"
}