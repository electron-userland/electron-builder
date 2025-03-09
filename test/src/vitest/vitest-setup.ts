import { isCI as isCi } from "ci-info"
import { afterEach, vitest } from "vitest"
import * as wrappedTest from "@test/vitest/vitest-test-wrapper"

afterEach(() => {
  vitest.clearAllMocks()
})

const isWindows = process.platform === "win32"
const isMac = process.platform === "darwin"
const isLinux = process.platform === "linux"

const test: any = wrappedTest.test

// test.ifEnv = test.runIf
// test.ifMac = test.runIf(isMac)
// test.ifNotMac = test.runIf(!isMac)

// test.ifWindows = test.runIf(isWindows)
// test.ifNotWindows = test.runIf(!isWindows)
// test.ifWinCi = test.runIf(isCi && isWindows)

// test.ifCi = test.runIf(isCi)
// test.ifNotCi = test.runIf(!isCi)
// test.ifNotCiMac = test.runIf(!isCi && !isMac)
// test.ifNotCiWin = test.runIf(!isCi && !isWindows)

// test.ifDevOrWinCi = test.runIf(!isCi || isWindows)
// test.ifDevOrLinuxCi = test.runIf(!isCi || isLinux)

// test.ifLinux = test.runIf(isLinux)
// test.ifLinuxOrDevMac = test.runIf(isLinux || (!isCi && isMac))

// test = {
//   ...test,
//   ifEnv: test.runIf,
//   ifMac: test.runIf(isMac),
//   ifNotMac: test.runIf(!isMac),

//   ifWindows: test.runIf(isWindows),
//   ifNotWindows: test.runIf(!isWindows),
//   ifWinCi: test.runIf(isCi && isWindows),

//   ifCi: test.runIf(isCi),
//   ifNotCi: test.runIf(!isCi),
//   ifNotCiMac: test.runIf(!isCi && !isMac),
//   ifNotCiWin: test.runIf(!isCi && !isWindows),

//   ifDevOrWinCi: test.runIf(!isCi || isWindows),
//   ifDevOrLinuxCi: test.runIf(!isCi || isLinux),

//   ifLinux: test.runIf(isLinux),
//   ifLinuxOrDevMac: test.runIf(isLinux || (!isCi && isMac)),
// }

const skip = test.skip

test.ifEnv = test.runIf

test.ifMac = isMac ? test : skip

test.ifNotWindows = isWindows ? skip : test
test.ifNotMac = isMac ? skip : test
test.ifNotWindows.ifNotCiMac = isCi && isMac ? skip : test

test.ifWindows = isWindows ? test : skip

skip.ifMac = skip
skip.ifLinux = skip
skip.ifWindows = skip

skip.ifNotWindows = skip
skip.ifNotMac = skip

skip.ifCi = skip
skip.ifNotCi = skip
skip.ifNotCiMac = skip
skip.ifNotCiWin = skip
skip.ifDevOrWinCi = skip
skip.ifDevOrLinuxCi = skip
skip.ifWinCi = skip
skip.ifLinuxOrDevMac = skip

if (isCi) {
  test.ifCi = test
  test.ifNotCi = skip
} else {
  test.ifCi = skip
  test.ifNotCi = test
}

test.ifNotCiMac = isCi && isMac ? skip : test
test.ifNotCiWin = isCi && isWindows ? skip : test

test.ifDevOrWinCi = !isCi || isWindows ? test : skip
test.ifDevOrLinuxCi = !isCi || isLinux ? test : skip
test.ifWinCi = isCi && isWindows ? test : skip
test.ifLinux = isLinux ? test : skip
test.ifLinuxOrDevMac = isLinux || (!isCi && isMac) ? test : skip

delete process.env.CSC_NAME
if (process.env.TEST_APP_TMP_DIR == null) {
  delete process.env.GH_TOKEN
}

if (!process.env.USE_HARD_LINKS) {
  process.env.USE_HARD_LINKS = "true"
}
if (!process.env.SZA_COMPRESSION_LEVEL) {
  process.env.SZA_COMPRESSION_LEVEL = "0"
}

process.env.FORCE_YARN = "true"
process.env.TEST_SET_BABEL_PRESET = "true"
