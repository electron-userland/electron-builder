import { Arch, archFromString, Platform } from "electron-builder"
import { promises as fs } from "fs"
import * as path from "path"
import { app, assertPack, copyTestAsset } from "../helpers/packTester"
import { checkHelpers, doTest, expectUpdateMetadata } from "../helpers/winHelper"

const nsisTarget = Platform.WINDOWS.createTarget(["nsis"])

test.ifNotCiMac("assisted", app({
  targets: nsisTarget,
  config: {
    nsis: {
      oneClick: false,
      language: "1031",
    },
    win: {
      legalTrademarks: "My Trademark"
    },
  }
}, {
  signedWin: true,
  projectDirCreated: projectDir => copyTestAsset("license.txt", path.join(projectDir, "build", "license.txt")),
}))

test.ifAll.ifNotCiMac("allowElevation false, app requestedExecutionLevel admin", app({
  targets: nsisTarget,
  config: {
    publish: null,
    extraMetadata: {
      // mt.exe doesn't like unicode names from wine
      name: "test",
      productName: "test"
    },
    win: {
      requestedExecutionLevel: "requireAdministrator",
    },
    nsis: {
      oneClick: false,
      allowElevation: false,
      perMachine: true,
      displayLanguageSelector: true,
      installerLanguages: ["en_US", "ru_RU"],
      differentialPackage: false,
    },
  }
}))

test.ifNotCiMac("assisted, MUI_HEADER", () => {
  let installerHeaderPath: string | null = null
  return assertPack("test-app-one", {
      targets: nsisTarget,
      config: {
        publish: null,
        nsis: {
          oneClick: false,
          differentialPackage: false,
        }
      },
      effectiveOptionComputed: async it => {
        const defines = it[0]
        expect(defines.MUI_HEADERIMAGE).toBeNull()
        expect(defines.MUI_HEADERIMAGE_BITMAP).toEqual(installerHeaderPath)
        expect(defines.MUI_HEADERIMAGE_RIGHT).toBeNull()
        // speedup, do not build - another MUI_HEADER test will test build
        return true
      }
    }, {
      projectDirCreated: projectDir => {
        installerHeaderPath = path.join(projectDir, "build", "installerHeader.bmp")
        return copyTestAsset("installerHeader.bmp", installerHeaderPath)
      }
    }
  )
})

test.ifAll.ifNotCiMac("assisted, MUI_HEADER as option", () => {
  let installerHeaderPath: string | null = null
  return assertPack("test-app-one", {
      targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32, Arch.x64),
      config: {
        publish: null,
        nsis: {
          oneClick: false,
          installerHeader: "foo.bmp",
          differentialPackage: false,
        }
      },
      effectiveOptionComputed: async it => {
        const defines = it[0]
        expect(defines.MUI_HEADERIMAGE).toBeNull()
        expect(defines.MUI_HEADERIMAGE_BITMAP).toEqual(installerHeaderPath)
        expect(defines.MUI_HEADERIMAGE_RIGHT).toBeNull()
        // test that we can build such installer
        return false
      }
    }, {
      projectDirCreated: projectDir => {
        installerHeaderPath = path.join(projectDir, "foo.bmp")
        return copyTestAsset("installerHeader.bmp", installerHeaderPath)
      },
    }
  )
})

test.ifNotCiMac("assisted, only perMachine", app({
  targets: nsisTarget,
  config: {
    nsis: {
      oneClick: false,
      perMachine: true,
    }
  }
}))

// test release notes also
test.ifAll.ifNotCiMac("allowToChangeInstallationDirectory", app({
  targets: nsisTarget,
  config: {
    extraMetadata: {
      name: "test-custom-inst-dir",
      productName: "Test Custom Installation Dir",
      repository: "foo/bar",
    },
    nsis: {
      allowToChangeInstallationDirectory: true,
      oneClick: false,
      multiLanguageInstaller: false,
    }
  },
}, {
  projectDirCreated: async projectDir => {
    await fs.writeFile(path.join(projectDir, "build", "release-notes.md"), "New release with new bugs and\n\nwithout features")
    await copyTestAsset("license.txt", path.join(projectDir, "build", "license.txt"))
  },
  packed: async context => {
    await expectUpdateMetadata(context, archFromString(process.arch))
    await checkHelpers(context.getResources(Platform.WINDOWS), true)
    await doTest(context.outDir, false)
  }
}))