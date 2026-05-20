import { Arch, Platform } from "app-builder-lib"
import { archFromString, getArchSuffix } from "builder-util"
import * as path from "path"
import { move } from "fs-extra"
import { TmpDir } from "temp-file"
import { OLD_VERSION_NUMBER, testAppCacheDirName } from "../helpers/updaterTestUtil"
import { NsisUpdater } from "electron-updater"
import { ToolsetConfig } from "app-builder-lib/src/configuration"
import { doBuild, getTestUpdaterCacheDir, testBlockMap } from "./differentialUpdateHelpers"

export function registerDifferentialWinTests(winCodeSign: ToolsetConfig["winCodeSign"]): void {
  test("web installer", async ({ expect }) => {
    const outDirs: Array<string> = []
    const tmpDir = new TmpDir("differential-updater-test")
    // need to build both in order for this to run on both arm64 and x64 windows
    await doBuild(expect, outDirs, Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64, Arch.arm64), tmpDir, { winCodeSign })

    const oldDir = outDirs[0]
    await move(
      path.join(oldDir, "nsis-web", `TestApp-${OLD_VERSION_NUMBER}${getArchSuffix(archFromString(process.arch), "universal")}.nsis.7z`),
      path.join(getTestUpdaterCacheDir(oldDir), testAppCacheDirName, "package.7z")
    )

    await testBlockMap(expect, outDirs[0], path.join(outDirs[1], "nsis-web"), NsisUpdater, Platform.WINDOWS, archFromString(process.arch))
  })

  test("nsis", async ({ expect }) => {
    const outDirs: Array<string> = []
    const tmpDir = new TmpDir("differential-updater-test")
    await doBuild(expect, outDirs, Platform.WINDOWS.createTarget(["nsis"], Arch.x64), tmpDir, { winCodeSign })

    const oldDir = outDirs[0]
    await move(path.join(oldDir, `Test App ßW Setup ${OLD_VERSION_NUMBER}.exe`), path.join(getTestUpdaterCacheDir(oldDir), testAppCacheDirName, "installer.exe"))
    await move(path.join(oldDir, `Test App ßW Setup ${OLD_VERSION_NUMBER}.exe.blockmap`), path.join(outDirs[1], "Test App ßW Setup 1.0.0.exe.blockmap"))

    await testBlockMap(expect, outDirs[0], outDirs[1], NsisUpdater, Platform.WINDOWS, Arch.x64)
  })
}
