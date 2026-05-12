import { Arch, Platform } from "app-builder-lib"
import { getArchSuffix } from "builder-util"
import { move } from "fs-extra"
import * as path from "path"
import { TmpDir } from "temp-file"
import { EXTENDED_TIMEOUT } from "../helpers/packTester"
import { OLD_VERSION_NUMBER, testAppCacheDirName } from "../helpers/updaterTestUtil"
import { MacUpdater } from "electron-updater"
import { ExpectStatic } from "vitest"
import { doBuild, getTestUpdaterCacheDir, testBlockMap } from "./differentialUpdateHelpers"

async function testMac(expect: ExpectStatic, arch: Arch) {
  process.env.TEST_UPDATER_ARCH = Arch[arch]

  const outDirs: Array<string> = []
  const tmpDir = new TmpDir("differential-updater-test")
  try {
    await doBuild(expect, outDirs, Platform.MAC.createTarget(["zip"], arch), tmpDir, null, {
      mac: {
        electronUpdaterCompatibility: ">=2.17.0",
      },
    })

    // move to new dir so that localhost server can read both blockmaps
    const oldDir = outDirs[0]
    const blockmap = `Test App ßW-${OLD_VERSION_NUMBER}${getArchSuffix(arch)}-mac.zip.blockmap`
    await move(path.join(oldDir, blockmap), path.join(outDirs[1], blockmap))
    await move(path.join(oldDir, `Test App ßW-${OLD_VERSION_NUMBER}${getArchSuffix(arch)}-mac.zip`), path.join(getTestUpdaterCacheDir(oldDir), testAppCacheDirName, "update.zip"))

    await testBlockMap(expect, outDirs[0], outDirs[1], MacUpdater, Platform.MAC, arch, "Test App ßW")
  } finally {
    await tmpDir.cleanup()
  }
}

test.ifMac("Mac Intel", ({ expect }) => testMac(expect, Arch.x64))
// builds 2 archs, so double the timeout?
test.ifMac("Mac universal", { timeout: 2 * EXTENDED_TIMEOUT }, ({ expect }) => testMac(expect, Arch.universal))

// only run on arm64 macs, otherwise of course no files can be found to be updated to (due to arch mismatch)
test.ifMac.ifEnv(process.arch === "arm64")("Mac arm64", ({ expect }) => testMac(expect, Arch.arm64))
