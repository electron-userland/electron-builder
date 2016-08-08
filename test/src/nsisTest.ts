import { Platform, Arch } from "out"
import test from "./helpers/avaEx"
import { assertPack, signed, getTestAsset } from "./helpers/packTester"
import { copy } from "fs-extra-p"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { assertThat } from "./helpers/fileAssert"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

test("one-click", () => assertPack("test-app-one", signed({
    targets: Platform.WINDOWS.createTarget(["nsis"]),
  }), {
    useTempDir: true,
  }
))

test.ifDevOrLinuxCi("perMachine, no run after finish", () => assertPack("test-app-one", {
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32, Arch.x64),
  devMetadata: {
    build: {
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
    }
  }
}))

test.ifNotCiOsx("boring", () => assertPack("test-app-one", signed({
  targets: Platform.WINDOWS.createTarget(["nsis"]),
  devMetadata: {
    build: {
      nsis: {
        oneClick: false,
      }
    }
  }
})))

test.ifNotCiOsx("installerHeaderIcon", () => {
  let headerIconPath: string | null = null
  return assertPack("test-app-one", {
      targets: Platform.WINDOWS.createTarget(["nsis"]),
      effectiveOptionComputed: options => {
        const defines = options[0]
        assertThat(defines.HEADER_ICO).isEqualTo(headerIconPath)
        return false
      }
    }, {
      tempDirCreated: projectDir => {
        headerIconPath = path.join(projectDir, "build", "installerHeaderIcon.ico")
        return copy(getTestAsset("headerIcon.ico"), headerIconPath)
      }
    }
  )
})

test.ifNotCiOsx("boring, MUI_HEADER", () => {
  let installerHeaderPath: string | null = null
  return assertPack("test-app-one", {
      targets: Platform.WINDOWS.createTarget(["nsis"]),
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
      tempDirCreated: projectDir => {
        installerHeaderPath = path.join(projectDir, "build", "installerHeader.bmp")
        return copy(getTestAsset("installerHeader.bmp"), installerHeaderPath)
      }
    }
  )
})

test.ifNotCiOsx("boring, MUI_HEADER as option", () => {
  let installerHeaderPath: string | null = null
  return assertPack("test-app-one", {
      targets: Platform.WINDOWS.createTarget(["nsis"]),
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
      tempDirCreated: projectDir => {
        installerHeaderPath = path.join(projectDir, "foo.bmp")
        return copy(getTestAsset("installerHeader.bmp"), installerHeaderPath)
      },
    }
  )
})

test.ifDevOrLinuxCi("custom include", () => assertPack("test-app-one", {
  targets: Platform.WINDOWS.createTarget(["nsis"]),
}, {
  tempDirCreated: projectDir => copy(getTestAsset("installer.nsh"), path.join(projectDir, "build", "installer.nsh")),
  packed: projectDir => BluebirdPromise.all([
    assertThat(path.join(projectDir, "build", "customHeader")).isFile(),
    assertThat(path.join(projectDir, "build", "customInit")).isFile(),
    assertThat(path.join(projectDir, "build", "customInstall")).isFile(),
  ]),
}))

test.ifDevOrLinuxCi("custom script", () => assertPack("test-app-one", {
  targets: Platform.WINDOWS.createTarget(["nsis"]),
}, {
  tempDirCreated: projectDir => copy(getTestAsset("installer.nsi"), path.join(projectDir, "build", "installer.nsi")),
  packed: projectDir => assertThat(path.join(projectDir, "build", "customInstallerScript")).isFile(),
}))