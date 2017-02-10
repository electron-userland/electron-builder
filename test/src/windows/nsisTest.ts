import { extractFile } from "asar-electron-builder"
import BluebirdPromise from "bluebird-lst-c"
import { Arch, Platform } from "electron-builder"
import { archFromString } from "electron-builder-core"
import { walk } from "electron-builder-util/out/fs"
import { outputFile, readFile } from "fs-extra-p"
import { safeLoad } from "js-yaml"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { app, appThrows, assertPack, copyTestAsset, modifyPackageJson } from "../helpers/packTester"
import { diff, WineManager } from "../helpers/wine"

const nsisTarget = Platform.WINDOWS.createTarget(["nsis"])

test("one-click", app({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
  config: {
    publish: {
      provider: "bintray",
      owner: "actperepo",
      package: "TestApp",
    },
    nsis: {
      unicode: false,
    }
    // wine creates incorrect filenames and registry entries for unicode, so, we use ASCII
    // productName: "TestApp",
  }
}, {
  useTempDir: true,
  signed: true,
  packed: async (context) => {
    await doTest(context.outDir, true)

    expect(safeLoad(await readFile(path.join(context.getResources(Platform.WINDOWS, Arch.ia32), "app-update.yml"), "utf-8"))).toMatchSnapshot()
  }
}))

test.ifDevOrLinuxCi("perMachine, no run after finish", app({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
  config: {
    // wine creates incorrect filenames and registry entries for unicode, so, we use ASCII
    productName: "TestApp",
    fileAssociations: [
      {
        ext: "foo",
        name: "Test Foo",
      }
    ],
    nsis: {
      perMachine: true,
      runAfterFinish: false,
    },
    publish: {
      provider: "generic",
      url: "https://develar.s3.amazonaws.com/test/${os}/${arch}",
    },
  },
}, {
  projectDirCreated: projectDir => {
    return BluebirdPromise.all([
      copyTestAsset("headerIcon.ico", path.join(projectDir, "build", "foo.ico")),
      copyTestAsset("license.txt", path.join(projectDir, "build", "license.txt"),
      )])
  },
  packed: async(context) => {
    expect(safeLoad(await readFile(path.join(context.getResources(Platform.WINDOWS, Arch.ia32), "app-update.yml"), "utf-8"))).toMatchSnapshot()
    const updateInfo = safeLoad(await readFile(path.join(context.outDir, "latest.yml"), "utf-8"))
    expect(updateInfo.sha2).not.toEqual("")
    expect(updateInfo.releaseDate).not.toEqual("")
    delete updateInfo.sha2
    delete updateInfo.releaseDate
    expect(updateInfo).toMatchSnapshot()
    await doTest(context.outDir, false)
  },
}))

async function doTest(outDir: string, perUser: boolean, productFilename = "TestApp Setup", name = "TestApp", menuCategory: string | null = null) {
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
  expect(JSON.parse(extractFile(appAsar, "package.json").toString())).toMatchObject({
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

test.ifNotCiMac("installerHeaderIcon", () => {
  let headerIconPath: string | null = null
  return assertPack("test-app-one", {
      targets: nsisTarget,
      effectiveOptionComputed: async (it) => {
        const defines = it[0]
        expect(defines.HEADER_ICO).toEqual(headerIconPath)
        return false
      }
    }, {
      projectDirCreated: projectDir => {
        headerIconPath = path.join(projectDir, "build", "installerHeaderIcon.ico")
        return copyTestAsset("headerIcon.ico", headerIconPath)
      }
    }
  )
})

test.ifDevOrLinuxCi("custom include", () => assertPack("test-app-one", {targets: nsisTarget}, {
  projectDirCreated: projectDir => copyTestAsset("installer.nsh", path.join(projectDir, "build", "installer.nsh")),
  packed: context => BluebirdPromise.all([
    assertThat(path.join(context.projectDir, "build", "customHeader")).isFile(),
    assertThat(path.join(context.projectDir, "build", "customInit")).isFile(),
    assertThat(path.join(context.projectDir, "build", "customInstall")).isFile(),
  ]),
}))

test.ifDevOrLinuxCi("custom script", app({targets: nsisTarget}, {
  projectDirCreated: projectDir => copyTestAsset("installer.nsi", path.join(projectDir, "build", "installer.nsi")),
  packed: context => assertThat(path.join(context.projectDir, "build", "customInstallerScript")).isFile(),
}))

test("allowToChangeInstallationDirectory", app({
  targets: nsisTarget,
  appMetadata: {
    name: "test-custom-inst-dir",
    productName: "Test Custom Installation Dir",
    repository: "foo/bar",
  },
  config: {
    nsis: {
      allowToChangeInstallationDirectory: true,
      oneClick: false,
    }
  }
}, {
  packed: async(context) => {
    expect(safeLoad(await readFile(path.join(context.getResources(Platform.WINDOWS, archFromString(process.arch)), "app-update.yml"), "utf-8"))).toMatchSnapshot()
    const updateInfo = safeLoad(await readFile(path.join(context.outDir, "latest.yml"), "utf-8"))
    expect(updateInfo.sha2).not.toEqual("")
    expect(updateInfo.releaseDate).not.toEqual("")
    delete updateInfo.sha2
    delete updateInfo.releaseDate
    expect(updateInfo).toMatchSnapshot()
    await doTest(context.outDir, false)
  }
}))

test("menuCategory", app({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
  appMetadata: {
    name: "test-menu-category",
    productName: "Test Menu Category"
  },
  config: {
    nsis: {
      perMachine: true,
      menuCategory: true,
      artifactName: "${productName} CustomName ${version}.${ext}"
    },
  }
}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.name = "test-menu-category"
  }),
  packed: async(context) => {
    await doTest(context.outDir, false, "Test Menu Category", "test-menu-category", "Foo Bar")
  }
}))

test.ifDevOrLinuxCi("file associations only perMachine", appThrows(/Please set perMachine to true/, {
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
  config: {
    fileAssociations: [
      {
        ext: "foo",
        name: "Test Foo",
      }
    ],
  },
}))

test.ifNotCiMac("web installer", app({
  targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
  config: {
    compression: process.env.COMPRESSION || "store",
    publish: {
      provider: "s3",
      bucket: "develar",
      path: "test",
    }
  }
}))