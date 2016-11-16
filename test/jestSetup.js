"use strict"

require('source-map-support').install()

const isWindows = process.platform === "win32"
const isCi = (process.env.CI || "").toLowerCase() === "true"

// Squirrel.Windows msi is very slow
jasmine.DEFAULT_TIMEOUT_INTERVAL = (isWindows ? 10 : 10) * 1000 * 60

if (!isWindows || isCi) {
  //noinspection JSUnresolvedVariable
  it = it.concurrent
  //noinspection JSUnresolvedVariable
  test = it
}

test.ifMac = process.platform === "darwin" ? test : test.skip
test.ifNotWindows = isWindows ? test.skip : test

if (isCi) {
  test.ifCi = test
  test.ifNotCi = test.skip
}
else {
  test.ifCi = test.skip
  test.ifNotCi = test
}

test.ifNotCiMac = isCi && process.platform === "darwin" ? test.skip : test

test.ifDevOrWinCi = !isCi || isWindows ? test : test.skip
test.ifDevOrLinuxCi = !isCi || process.platform === "linux" ? test : test.skip
test.ifWinCi = isCi && isWindows ? test : test.skip