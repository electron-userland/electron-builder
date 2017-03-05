import BluebirdPromise from "bluebird-lst"
import { Arch, Platform } from "electron-builder-core"
import { walk } from "electron-builder-util/out/fs"
import { readAsarJson } from "electron-builder/out/asar"
import { outputFile, readFile } from "fs-extra-p"
import { safeLoad } from "js-yaml"
import * as path from "path"
import { assertThat } from "./fileAssert"
import { PackedContext } from "./packTester"
import { diff, WineManager } from "./wine"

export async function expectUpdateMetadata(context: PackedContext, arch: Arch = Arch.ia32, requireCodeSign: boolean = false): Promise<void> {
  const data = safeLoad(await readFile(path.join(context.getResources(Platform.WINDOWS, arch), "app-update.yml"), "utf-8"))
  if (requireCodeSign && process.env.CSC_KEY_PASSWORD != null) {
    expect(data.publisherName).toEqual(["Developer ID Installer: Vladimir Krivosheev (X8C9Z9L4HW)"])
    delete data.publisherName
  }

  expect(data).toMatchSnapshot()
}

export async function doTest(outDir: string, perUser: boolean, productFilename = "TestApp Setup", name = "TestApp", menuCategory: string | null = null) {
  if (process.env.DO_WINE !== "true") {
    return BluebirdPromise.resolve()
  }

  const wine = new WineManager()
  await wine.prepare()
  const driveC = path.join(wine.wineDir, "drive_c")
  const driveCWindows = path.join(wine.wineDir, "drive_c", "windows")
  const perUserTempDir = path.join(wine.userDir, "Temp")
  const walkFilter = (it: string) => {
    return it !== driveCWindows && it !== perUserTempDir
  }

  function listFiles() {
    return walk(driveC, null, walkFilter)
  }

  let fsBefore = await listFiles()

  await wine.exec(path.join(outDir, `${productFilename} Setup 1.1.0.exe`), "/S")

  let instDir = perUser ? path.join(wine.userDir, "Local Settings", "Application Data", "Programs") : path.join(driveC, "Program Files")
  if (menuCategory != null) {
    instDir = path.join(instDir, menuCategory)
  }

  const appAsar = path.join(instDir, name, "resources", "app.asar")
  expect(await readAsarJson(appAsar, "package.json")).toMatchObject({
    name: name,
  })

  if (!perUser) {
    let startMenuDir = path.join(driveC, "users", "Public", "Start Menu", "Programs")
    if (menuCategory != null) {
      startMenuDir = path.join(startMenuDir, menuCategory)
    }
    await assertThat(path.join(startMenuDir, `${productFilename}.lnk`)).isFile()
  }

  let fsAfter = await listFiles()

  let fsChanges = diff(fsBefore, fsAfter, driveC)
  expect(fsChanges.added).toMatchSnapshot()
  expect(fsChanges.deleted).toEqual([])

  // run installer again to test uninstall
  const appDataFile = path.join(wine.userDir, "Application Data", name, "doNotDeleteMe")
  await outputFile(appDataFile, "app data must be not removed")
  fsBefore = await listFiles()
  await wine.exec(path.join(outDir, `${productFilename} Setup 1.1.0.exe`), "/S")
  fsAfter = await listFiles()

  fsChanges = diff(fsBefore, fsAfter, driveC)
  expect(fsChanges.added).toEqual([])
  expect(fsChanges.deleted).toEqual([])

  await assertThat(appDataFile).isFile()

  await wine.exec(path.join(outDir, `${productFilename} Setup 1.1.0.exe`), "/S", "--delete-app-data")
  await assertThat(appDataFile).doesNotExist()
}
