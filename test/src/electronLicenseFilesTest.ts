import { Platform } from "app-builder-lib"
import { cleanupAfterUnpack } from "app-builder-lib/src/electron/ElectronFramework"
import { PrepareApplicationStageDirectoryOptions } from "app-builder-lib/src/Framework"
import { mkdir, readdir, writeFile } from "fs/promises"
import * as path from "path"

// Unit tests for retaining Electron's and Chromium's license files (https://github.com/electron-userland/electron-builder/issues/9407).
// A minimal fake packager is pointed at a fake app output directory populated the way an extracted Electron dist looks.

const DIST_MAC_OS_APP_NAME = "Electron.app"

function fakeOptions(platform: Platform, appOutDir: string): PrepareApplicationStageDirectoryOptions {
  return { packager: { platform }, appOutDir } as unknown as PrepareApplicationStageDirectoryOptions
}

// an extracted Electron dist: the licenses sit next to the executable (win/linux) or next to the .app bundle (mac)
async function createElectronDist(appOutDir: string, isMac: boolean): Promise<string> {
  const resourcesDir = isMac ? path.join(appOutDir, DIST_MAC_OS_APP_NAME, "Contents", "Resources") : path.join(appOutDir, "resources")
  await mkdir(resourcesDir, { recursive: true })
  await writeFile(path.join(appOutDir, "LICENSE"), "electron license")
  await writeFile(path.join(appOutDir, "LICENSES.chromium.html"), "chromium licenses")
  return resourcesDir
}

describe("cleanupAfterUnpack", () => {
  test("moves both license files into the mac app bundle resources", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.getTempDir()
    const resourcesDir = await createElectronDist(appOutDir, true)
    await cleanupAfterUnpack(fakeOptions(Platform.MAC, appOutDir), DIST_MAC_OS_APP_NAME, true)
    expect((await readdir(resourcesDir)).sort()).toEqual(["LICENSE.electron.txt", "LICENSES.chromium.html"])
    // nothing is left outside the bundle, since only the bundle is packaged into the artifacts
    expect(await readdir(appOutDir)).toEqual([DIST_MAC_OS_APP_NAME])
  })

  test("keeps license files next to the executable on win/linux", async ({ expect, tmpDir }) => {
    for (const platform of [Platform.WINDOWS, Platform.LINUX]) {
      const appOutDir = await tmpDir.getTempDir()
      await createElectronDist(appOutDir, false)
      await cleanupAfterUnpack(fakeOptions(platform, appOutDir), DIST_MAC_OS_APP_NAME, true)
      expect((await readdir(appOutDir)).sort()).toEqual(["LICENSE.electron.txt", "LICENSES.chromium.html", "resources"])
    }
  })

  test("tolerates a custom Electron distribution without license files", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.getTempDir()
    await mkdir(path.join(appOutDir, DIST_MAC_OS_APP_NAME, "Contents", "Resources"), { recursive: true })
    await expect(cleanupAfterUnpack(fakeOptions(Platform.MAC, appOutDir), DIST_MAC_OS_APP_NAME, false)).resolves.toBeDefined()
  })
})
