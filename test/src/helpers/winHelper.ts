import { walk } from "builder-util/out/fs"
import { Arch, Platform } from "electron-builder"
import { readAsarJson } from "app-builder-lib/out/asar/asar"
import { outputFile } from "fs-extra"
import * as fs from "fs/promises"
import { load } from "js-yaml"
import * as path from "path"
import { assertThat } from "./fileAssert"
import { PackedContext } from "./packTester"
import { diff, WineManager } from "./wine"

export async function expectUpdateMetadata(context: PackedContext, arch: Arch = Arch.ia32, requireCodeSign: boolean = false): Promise<void> {
  const data = load(await fs.readFile(path.join(context.getResources(Platform.WINDOWS, arch), "app-update.yml"), "utf-8")) as any
  if (requireCodeSign) {
    expect(data.publisherName).toEqual(["Foo, Inc"])
    delete data.publisherName
  }

  expect(data).toMatchSnapshot()
}

export async function checkHelpers(resourceDir: string, isPackElevateHelper: boolean) {
  const elevateHelperExecutable = path.join(resourceDir, "elevate.exe")
  if (isPackElevateHelper) {
    await assertThat(elevateHelperExecutable).isFile()
  } else {
    await assertThat(elevateHelperExecutable).doesNotExist()
  }
}

export async function doTest(outDir: string, perUser: boolean, productFilename = "TestApp Setup", name = "TestApp", menuCategory: string | null = null, packElevateHelper = true) {
  if (process.env.DO_WINE !== "true") {
    return Promise.resolve()
  }

  const wine = new WineManager()
  await wine.prepare()
  const driveC = path.join(wine.wineDir!!, "drive_c")
  const driveCWindows = path.join(wine.wineDir!!, "drive_c", "windows")
  const perUserTempDir = path.join(wine.userDir!!, "Temp")
  const walkFilter = (it: string) => {
    return it !== driveCWindows && it !== perUserTempDir
  }

  function listFiles() {
    return walk(driveC, null, { consume: walkFilter })
  }

  let fsBefore = await listFiles()

  await wine.exec(path.join(outDir, `${productFilename} Setup 1.1.0.exe`), "/S")

  let instDir = perUser ? path.join(wine.userDir!!, "Local Settings", "Application Data", "Programs") : path.join(driveC, "Program Files")
  if (menuCategory != null) {
    instDir = path.join(instDir, menuCategory)
  }

  const appAsar = path.join(instDir, name, "resources", "app.asar")
  expect(await readAsarJson(appAsar, "package.json")).toMatchObject({
    name,
  })

  if (!perUser) {
    let startMenuDir = path.join(driveC, "users", "Public", "Start Menu", "Programs")
    if (menuCategory != null) {
      startMenuDir = path.join(startMenuDir, menuCategory)
    }
    await assertThat(path.join(startMenuDir, `${productFilename}.lnk`)).isFile()
  }

  if (packElevateHelper) {
    await assertThat(path.join(instDir, name, "resources", "elevate.exe")).isFile()
  } else {
    await assertThat(path.join(instDir, name, "resources", "elevate.exe")).doesNotExist()
  }

  let fsAfter = await listFiles()

  let fsChanges = diff(fsBefore, fsAfter, driveC)
  expect(fsChanges.added).toMatchSnapshot()
  expect(fsChanges.deleted).toEqual([])

  // run installer again to test uninstall
  const appDataFile = path.join(wine.userDir!!, "Application Data", name, "doNotDeleteMe")
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
