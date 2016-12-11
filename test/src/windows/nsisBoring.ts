import { Platform, Arch } from "out"
import { assertPack, app, copyTestAsset } from "../helpers/packTester"
import * as path from "path"

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

test.ifNotCiMac("boring, MUI_HEADER as option", () => {
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
