import { isCI as isCi } from "ci-info"
import { afterEach, beforeEach, vitest, test as wrappedTest } from "@test/vitest/vitest-test-wrapper"
import { TmpDir } from "temp-file"

const tmpDir = new TmpDir()

beforeEach(async () => {
  // must set custom yarn cache dir due to concurrency of tests sometimes colliding in the yarn cache (
  process.env.YARN_CACHE_FOLDER = await tmpDir.getTempDir()
})
afterEach(() => {
  vitest.clearAllMocks()
  tmpDir.cleanupSync()
})

const isWindows = process.platform === "win32"
const isMac = process.platform === "darwin"
const isLinux = process.platform === "linux"

const test: any = wrappedTest

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
