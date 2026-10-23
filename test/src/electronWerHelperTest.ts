import { Platform } from "app-builder-lib"
import { beforeCopyExtraFiles, renameWindowsWerHelperIfNeeded } from "app-builder-lib/src/electron/ElectronFramework"
import { BeforeCopyExtraFilesOptions } from "app-builder-lib/src/Framework"
import { mkdir, readdir, writeFile } from "fs/promises"
import * as path from "path"

// Electron 45 ships `electron_wer.dll`, looked up as `<executable name>_wer.dll`, so it has to follow the executable rename
// (https://github.com/electron-userland/electron-builder/issues/10395).

async function createWindowsAppOutDir(appOutDir: string, files: string[]): Promise<void> {
  await mkdir(appOutDir, { recursive: true })
  for (const file of files) {
    await writeFile(path.join(appOutDir, file), "")
  }
}

function fakeWindowsOptions(appOutDir: string, productFilename: string): BeforeCopyExtraFilesOptions {
  const packager = {
    platform: Platform.WINDOWS,
    platformOptions: {},
    config: {},
    appInfo: { productFilename },
  }
  return { packager, appOutDir, asarIntegrity: null, platformName: Platform.WINDOWS.nodeName } as unknown as BeforeCopyExtraFilesOptions
}

describe("renameWindowsWerHelperIfNeeded", () => {
  test("Electron 44 and older leave electron_wer.dll untouched", async ({ expect, tmpDir }) => {
    for (const version of ["44.0.0", "44.9.9", "40.1.0"]) {
      const appOutDir = await tmpDir.getTempDir({ prefix: "eb-wer-helper" })
      await createWindowsAppOutDir(appOutDir, ["electron_wer.dll"])
      await renameWindowsWerHelperIfNeeded(appOutDir, "electron", "MyApp", version)
      expect(await readdir(appOutDir)).toEqual(["electron_wer.dll"])
    }
  })

  test("Electron 45 and later rename electron_wer.dll to match the executable", async ({ expect, tmpDir }) => {
    for (const version of ["45.0.0", "45.0.0-alpha.1", "45.0.0-nightly.20260714", "46.2.1"]) {
      const appOutDir = await tmpDir.getTempDir({ prefix: "eb-wer-helper" })
      await createWindowsAppOutDir(appOutDir, ["electron_wer.dll"])
      await renameWindowsWerHelperIfNeeded(appOutDir, "electron", "MyApp", version)
      expect(await readdir(appOutDir)).toEqual(["MyApp_wer.dll"])
    }
  })

  test("uses the electronBranding project name as the source name", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.getTempDir({ prefix: "eb-wer-helper" })
    await createWindowsAppOutDir(appOutDir, ["custom_wer.dll"])
    await renameWindowsWerHelperIfNeeded(appOutDir, "custom", "MyApp", "45.0.0")
    expect(await readdir(appOutDir)).toEqual(["MyApp_wer.dll"])
  })

  test("a missing DLL (opted out of WER crash capture) is not an error", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.getTempDir({ prefix: "eb-wer-helper" })
    await createWindowsAppOutDir(appOutDir, ["MyApp.exe"])
    await expect(renameWindowsWerHelperIfNeeded(appOutDir, "electron", "MyApp", "45.0.0")).resolves.toBeUndefined()
    expect(await readdir(appOutDir)).toEqual(["MyApp.exe"])
  })

  test("unparseable version is left untouched", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.getTempDir({ prefix: "eb-wer-helper" })
    await createWindowsAppOutDir(appOutDir, ["electron_wer.dll"])
    await renameWindowsWerHelperIfNeeded(appOutDir, "electron", "MyApp", "not-a-version")
    expect(await readdir(appOutDir)).toEqual(["electron_wer.dll"])
  })
})

describe("beforeCopyExtraFiles on Windows", () => {
  test("Electron 44 renames only the executable", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.getTempDir({ prefix: "eb-wer-helper" })
    await createWindowsAppOutDir(appOutDir, ["electron.exe", "electron_wer.dll"])
    await beforeCopyExtraFiles(fakeWindowsOptions(appOutDir, "MyApp"), "44.1.0")
    expect((await readdir(appOutDir)).sort()).toEqual(["MyApp.exe", "electron_wer.dll"])
  })

  test("Electron 45 renames the executable and its WER helper together", async ({ expect, tmpDir }) => {
    const appOutDir = await tmpDir.getTempDir({ prefix: "eb-wer-helper" })
    await createWindowsAppOutDir(appOutDir, ["electron.exe", "electron_wer.dll"])
    await beforeCopyExtraFiles(fakeWindowsOptions(appOutDir, "MyApp"), "45.0.0")
    expect((await readdir(appOutDir)).sort()).toEqual(["MyApp.exe", "MyApp_wer.dll"])
  })
})
