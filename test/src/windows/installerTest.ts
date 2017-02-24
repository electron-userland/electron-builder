import { Arch, Platform } from "electron-builder"
import { archFromString } from "electron-builder-core"
import { readFile } from "fs-extra-p"
import { safeLoad } from "js-yaml"
import * as path from "path"
import { app, assertPack, copyTestAsset } from "../helpers/packTester"
import { doTest, expectUpdateMetadata } from "../helpers/winHelper"

const nsisTarget = Platform.WINDOWS.createTarget(["nsis"])

test.ifNotCiMac("boring, MUI_HEADER", () => {
  let installerHeaderPath: string | null = null
  return assertPack("test-app-one", {
      targets: nsisTarget,
      config: {
        nsis: {
          oneClick: false,
        }
      },
      effectiveOptionComputed: async(it) => {
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

test.ifAll.ifNotCiMac("boring, MUI_HEADER as option", () => {
  let installerHeaderPath: string | null = null
  return assertPack("test-app-one", {
    targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32, Arch.x64),
    config: {
      nsis: {
        oneClick: false,
        installerHeader: "foo.bmp"
      }
    },
      effectiveOptionComputed: async (it) => {
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

test.ifNotCiMac("boring, only perMachine", app({
  targets: nsisTarget,
  config: {
    nsis: {
      oneClick: false,
      perMachine: true,
    }
  }
}))

test.ifNotCiMac("boring", app({
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
  signed: true,
  projectDirCreated: projectDir => {
    return copyTestAsset("license.txt", path.join(projectDir, "build", "license.txt"))
  },
}))

test.ifAll("allowToChangeInstallationDirectory", app({
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
    await expectUpdateMetadata(context, archFromString(process.arch))
    const updateInfo = safeLoad(await readFile(path.join(context.outDir, "latest.yml"), "utf-8"))
    expect(updateInfo.sha2).not.toEqual("")
    expect(updateInfo.releaseDate).not.toEqual("")
    delete updateInfo.sha2
    delete updateInfo.releaseDate
    expect(updateInfo).toMatchSnapshot()
    await doTest(context.outDir, false)
  }
}))

test.ifNotCiMac("portable", app({
  targets: Platform.WINDOWS.createTarget(["portable"]),
  config: {
    nsis: {
    }
  }
}))