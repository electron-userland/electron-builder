import { Platform, Arch } from "out"
import test from "./helpers/avaEx"
import { assertPack, getTestAsset, app } from "./helpers/packTester"
import { copy, outputFile, readFile } from "fs-extra-p"
import * as path from "path"
import BluebirdPromise from "bluebird-lst-c"
import { assertThat } from "./helpers/fileAssert"
import { extractFile } from "asar-electron-builder"
import { walk } from "out/asarUtil"
import { nsisPerMachineInstall } from "./helpers/expectedContents"
import { WineManager, diff } from "./helpers/wine"
import { safeLoad } from "js-yaml"

const nsisTarget = Platform.WINDOWS.createTarget(["nsis"])

test("one-click", app({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
  devMetadata: {
    build: {
      publish: {
        provider: "bintray",
        owner: "actperepo",
        package: "TestApp",
      },
      // wine creates incorrect filenames and registry entries for unicode, so, we use ASCII
      // productName: "TestApp",
    }
  }
}, {
  useTempDir: true,
  signed: true,
  packed: async (context) => {
    await doTest(context.outDir, true)

    assertThat(safeLoad(await readFile(path.join(context.getResources(Platform.WINDOWS, Arch.ia32), "app-update.yml"), "utf-8"))).hasProperties({
      provider: "bintray",
      owner: "actperepo",
      package: "TestApp",
    })
  }
}))

test.ifDevOrLinuxCi("perMachine, no run after finish", app({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
  devMetadata: {
    build: {
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
        url: "https://develar.s3.amazonaws.com/test",
      },
    }
  },
}, {
  projectDirCreated: projectDir => {
    let headerIconPath = path.join(projectDir, "build", "foo.ico")
    return BluebirdPromise.all([copy(getTestAsset("headerIcon.ico"), headerIconPath), copy(getTestAsset("license.txt"), path.join(projectDir, "build", "license.txt"))])
  },
  packed: async(context) => {
    assertThat(safeLoad(await readFile(path.join(context.getResources(Platform.WINDOWS, Arch.ia32), "app-update.yml"), "utf-8"))).hasProperties({
          provider: "generic",
          url: "https://develar.s3.amazonaws.com/test",
        })
    const updateInfo = safeLoad(await readFile(path.join(context.outDir, "latest.yml"), "utf-8"))
    assertThat(updateInfo).hasProperties({
          version: "1.1.0",
          path: "TestApp Setup 1.1.0.exe",
        })
    assertThat(updateInfo.sha2).isNotEmpty()
    await doTest(context.outDir, false)
  },
}))

async function doTest(outDir: string, perUser: boolean) {
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

  await wine.exec(path.join(outDir, "TestApp Setup 1.1.0.exe"), "/S")

  const instDir = perUser ? path.join(wine.userDir, "Local Settings", "Application Data", "Programs") : path.join(driveC, "Program Files")
  const appAsar = path.join(instDir, "TestApp", "1.1.0", "resources", "app.asar")
  assertThat(JSON.parse(extractFile(appAsar, "package.json").toString())).hasProperties({
    name: "TestApp"
  })

  let fsAfter = await listFiles()

  let fsChanges = diff(fsBefore, fsAfter, driveC)
  assertThat(fsChanges.added).isEqualTo(nsisPerMachineInstall)
  assertThat(fsChanges.deleted).isEqualTo([])

  // run installer again to test uninstall
  const appDataFile = path.join(wine.userDir, "Application Data", "TestApp", "doNotDeleteMe")
  await outputFile(appDataFile, "app data must be not removed")
  fsBefore = await listFiles()
  await wine.exec(path.join(outDir, "TestApp Setup 1.1.0.exe"), "/S")
  fsAfter = await listFiles()

  fsChanges = diff(fsBefore, fsAfter, driveC)
  assertThat(fsChanges.added).isEqualTo([])
  assertThat(fsChanges.deleted).isEqualTo([])

  await assertThat(appDataFile).isFile()

  await wine.exec(path.join(outDir, "TestApp Setup 1.1.0.exe"), "/S", "--delete-app-data")
  await assertThat(appDataFile).doesNotExist()
}

test.ifNotCiOsx("boring", app({
  targets: nsisTarget,
  devMetadata: {
    build: {
      nsis: {
        oneClick: false,
        language: "1031",
      },
      win: {
        legalTrademarks: "My Trademark"
      },
    }
  }
}, {
  signed: true,
  projectDirCreated: projectDir => {
    return copy(getTestAsset("license.txt"), path.join(projectDir, "build", "license.txt"))
  },
}))

test.ifNotCiOsx("boring, only perMachine", app({
  targets: nsisTarget,
  devMetadata: {
    build: {
      nsis: {
        oneClick: false,
        perMachine: true,
      }
    }
  }
}))

test.ifNotCiOsx("installerHeaderIcon", () => {
  let headerIconPath: string | null = null
  return assertPack("test-app-one", {
      targets: nsisTarget,
      effectiveOptionComputed: options => {
        const defines = options[0]
        assertThat(defines.HEADER_ICO).isEqualTo(headerIconPath)
        return false
      }
    }, {
      projectDirCreated: projectDir => {
        headerIconPath = path.join(projectDir, "build", "installerHeaderIcon.ico")
        return copy(getTestAsset("headerIcon.ico"), headerIconPath)
      }
    }
  )
})

test.ifNotCiOsx("boring, MUI_HEADER", () => {
  let installerHeaderPath: string | null = null
  return assertPack("test-app-one", {
      targets: nsisTarget,
      devMetadata: {
        build: {
          nsis: {
            oneClick: false,
          }
        }
      },
      effectiveOptionComputed: options => {
        const defines = options[0]
        assertThat(defines.MUI_HEADERIMAGE).isEqualTo(null)
        assertThat(defines.MUI_HEADERIMAGE_BITMAP).isEqualTo(installerHeaderPath)
        assertThat(defines.MUI_HEADERIMAGE_RIGHT).isEqualTo(null)
        // speedup, do not build - another MUI_HEADER test will test build
        return true
      }
    }, {
      projectDirCreated: projectDir => {
        installerHeaderPath = path.join(projectDir, "build", "installerHeader.bmp")
        return copy(getTestAsset("installerHeader.bmp"), installerHeaderPath)
      }
    }
  )
})

test.ifNotCiOsx("boring, MUI_HEADER as option", () => {
  let installerHeaderPath: string | null = null
  return assertPack("test-app-one", {
      targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32, Arch.x64),
      devMetadata: {
        build: {
          nsis: {
            oneClick: false,
            installerHeader: "foo.bmp"
          }
        }
      },
      effectiveOptionComputed: options => {
        const defines = options[0]
        assertThat(defines.MUI_HEADERIMAGE).isEqualTo(null)
        assertThat(defines.MUI_HEADERIMAGE_BITMAP).isEqualTo(installerHeaderPath)
        assertThat(defines.MUI_HEADERIMAGE_RIGHT).isEqualTo(null)
        // test that we can build such installer
        return false
      }
    }, {
      projectDirCreated: projectDir => {
        installerHeaderPath = path.join(projectDir, "foo.bmp")
        return copy(getTestAsset("installerHeader.bmp"), installerHeaderPath)
      },
    }
  )
})

test.ifDevOrLinuxCi("custom include", () => assertPack("test-app-one", {targets: nsisTarget}, {
  projectDirCreated: projectDir => copy(getTestAsset("installer.nsh"), path.join(projectDir, "build", "installer.nsh")),
  packed: context => BluebirdPromise.all([
    assertThat(path.join(context.projectDir, "build", "customHeader")).isFile(),
    assertThat(path.join(context.projectDir, "build", "customInit")).isFile(),
    assertThat(path.join(context.projectDir, "build", "customInstall")).isFile(),
  ]),
}))

test.ifDevOrLinuxCi("custom script", app({targets: nsisTarget}, {
  projectDirCreated: projectDir => copy(getTestAsset("installer.nsi"), path.join(projectDir, "build", "installer.nsi")),
  packed: context => assertThat(path.join(context.projectDir, "build", "customInstallerScript")).isFile(),
}))