import { Platform } from "app-builder-lib/src/core"
import { cleanupAfterUnpack } from "app-builder-lib/src/electron/ElectronFramework"
import { PrepareApplicationStageDirectoryOptions } from "app-builder-lib/src/Framework"
import { mkdir, readdir, writeFile } from "fs/promises"
import * as path from "path"
import { TmpDir } from "temp-file"
import { afterAll } from "vitest"

// Unit tests for retaining Electron's and Chromium's license files (https://github.com/electron-userland/electron-builder/issues/9407).
// A minimal fake packager is pointed at a fake app output directory populated the way an extracted Electron dist looks.

const DIST_MAC_OS_APP_NAME = "Electron.app"

// release/v26 has no per-test `tmpDir` fixture (unlike master), so one TmpDir is shared by the file and cleaned up afterwards
const tmpDir = new TmpDir("electron-license-files")
afterAll(() => tmpDir.cleanup())

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
  test("moves both license files into the mac app bundle resources", async ({ expect }) => {
    const appOutDir = await tmpDir.getTempDir()
    const resourcesDir = await createElectronDist(appOutDir, true)
    await cleanupAfterUnpack(fakeOptions(Platform.MAC, appOutDir), DIST_MAC_OS_APP_NAME, true)
    expect((await readdir(resourcesDir)).sort()).toEqual(["LICENSE.electron.txt", "LICENSES.chromium.html"])
    // nothing is left outside the bundle, since only the bundle is packaged into the artifacts
    expect(await readdir(appOutDir)).toEqual([DIST_MAC_OS_APP_NAME])
  })

  test("keeps license files next to the executable on win/linux", async ({ expect }) => {
    for (const platform of [Platform.WINDOWS, Platform.LINUX]) {
      const appOutDir = await tmpDir.getTempDir()
      await createElectronDist(appOutDir, false)
      await cleanupAfterUnpack(fakeOptions(platform, appOutDir), DIST_MAC_OS_APP_NAME, true)
      expect((await readdir(appOutDir)).sort()).toEqual(["LICENSE.electron.txt", "LICENSES.chromium.html", "resources"])
    }
  })

  test("tolerates a custom Electron distribution without license files", async ({ expect }) => {
    const appOutDir = await tmpDir.getTempDir()
    await mkdir(path.join(appOutDir, DIST_MAC_OS_APP_NAME, "Contents", "Resources"), { recursive: true })
    await expect(cleanupAfterUnpack(fakeOptions(Platform.MAC, appOutDir), DIST_MAC_OS_APP_NAME, false)).resolves.toBeDefined()
  })

  test("propagates errors other than a missing license file", async ({ expect }) => {
    const appOutDir = await tmpDir.getTempDir()
    const resourcesDir = await createElectronDist(appOutDir, true)
    // a directory squatting on the destination makes the rename fail with something other than ENOENT
    await mkdir(path.join(resourcesDir, "LICENSE.electron.txt"))
    await expect(cleanupAfterUnpack(fakeOptions(Platform.MAC, appOutDir), DIST_MAC_OS_APP_NAME, false)).rejects.toThrow()
  })
})
