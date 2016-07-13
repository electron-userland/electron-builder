import { Platform, Arch, BuildInfo, PackagerOptions } from "out"
import test from "./helpers/avaEx"
import { assertPack, platform, modifyPackageJson, signed, getTestAsset } from "./helpers/packTester"
import { outputFile, rename, copy } from "fs-extra-p"
import * as path from "path"
import { WinPackager } from "out/winPackager"
import { Promise as BluebirdPromise } from "bluebird"
import { assertThat } from "./helpers/fileAssert"
import { SignOptions } from "signcode-tf"
import SquirrelWindowsTarget from "out/targets/squirrelWindows"
import { Target } from "out/platformPackager"
import { ElectronPackagerOptions } from "out/packager/dirPackager"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

function _signed(packagerOptions: PackagerOptions): PackagerOptions {
  if (process.platform !== "win32") {
    // todo Linux  Signing failed with SIGBUS
    return packagerOptions
  }
  return signed(packagerOptions)
}

test.ifNotCiOsx("win", () => assertPack("test-app-one", _signed({
    targets: Platform.WINDOWS.createTarget(["default", "zip"]),
  })
))

test("nsis", () => assertPack("test-app-one", _signed({
    targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32, Arch.x64),
  }), {
  useTempDir: true,
  }
))

test.ifDevOrLinuxCi("nsis 32 perMachine, no run after finish", () => assertPack("test-app-one", {
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.ia32),
  devMetadata: {
    build: {
      nsis: {
        perMachine: true,
        runAfterFinish: false,
      }
    }
  }
}))

test.ifNotCiOsx("nsis boring", () => assertPack("test-app-one", _signed({
  targets: Platform.WINDOWS.createTarget(["nsis"]),
  devMetadata: {
    build: {
      nsis: {
        oneClick: false,
      }
    }
  }
})))

test.ifNotCiOsx("nsis, installerHeaderIcon", () => {
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

test.ifNotCiOsx("nsis boring, MUI_HEADER", () => {
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

test.ifNotCiOsx("nsis boring, MUI_HEADER as option", () => {
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
      }
    }
  )
})

// very slow
test.skip("delta and msi", () => assertPack("test-app-one", {
    targets: Platform.WINDOWS.createTarget(null, Arch.ia32),
    devMetadata: {
      build: {
        win: {
          remoteReleases: "https://github.com/develar/__test-app-releases",
          msi: true,
        }
      }
    },
  }
))

test.ifDevOrWinCi("beta version", () => {
  const metadata: any = {
    version: "3.0.0-beta.2"
  }
  return assertPack("test-app-one", {
    targets: Platform.WINDOWS.createTarget(["squirrel", "nsis"]),
    devMetadata: metadata
  })
})

test.ifNotCiOsx("msi as string", t => t.throws(assertPack("test-app-one", platform(Platform.WINDOWS),
  {
    tempDirCreated: it => modifyPackageJson(it, data => {
      data.build.win = {
        msi: "false",
      }
    })
  }), `msi expected to be boolean value, but string '"false"' was specified`)
)

test("detect install-spinner, certificateFile/password", () => {
  let platformPackager: CheckingWinPackager = null
  let loadingGifPath: string = null

  return assertPack("test-app-one", {
    targets: Platform.WINDOWS.createTarget(),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingWinPackager(packager, cleanupTasks),
    devMetadata: {
      build: {
        win: {
          certificatePassword: "pass",
        }
      }
    }
  }, {
    tempDirCreated: it => {
      loadingGifPath = path.join(it, "build", "install-spinner.gif")
      return BluebirdPromise.all([
        copy(getTestAsset("install-spinner.gif"), loadingGifPath),
        modifyPackageJson(it, data => {
          data.build.win = {
            certificateFile: "secretFile",
            certificatePassword: "mustBeOverridden",
          }
        })])
    },
    packed: () => {
      assertThat(platformPackager.effectiveDistOptions.loadingGif).isEqualTo(loadingGifPath)
      assertThat(platformPackager.signOptions.cert).isEqualTo("secretFile")
      assertThat(platformPackager.signOptions.password).isEqualTo("pass")
      return BluebirdPromise.resolve(null)
    },
  })
})

test.ifNotCiOsx("icon < 256", (t: any) => t.throws(assertPack("test-app-one", platform(Platform.WINDOWS), {
  tempDirCreated: projectDir => rename(path.join(projectDir, "build", "incorrect.ico"), path.join(projectDir, "build", "icon.ico"))
}), /Windows icon size must be at least 256x256, please fix ".+/))

test.ifNotCiOsx("icon not an image", (t: any) => t.throws(assertPack("test-app-one", platform(Platform.WINDOWS), {
  tempDirCreated: projectDir => outputFile(path.join(projectDir, "build", "icon.ico"), "foo")
}), /Windows icon is not valid ico file, please fix ".+/))

test.ifOsx("custom icon", () => {
  let platformPackager: CheckingWinPackager = null
  return assertPack("test-app-one", {
    targets: Platform.WINDOWS.createTarget(),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingWinPackager(packager, cleanupTasks)
  }, {
    tempDirCreated: projectDir => BluebirdPromise.all([
      rename(path.join(projectDir, "build", "icon.ico"), path.join(projectDir, "customIcon.ico")),
      modifyPackageJson(projectDir, data => {
        data.build.win = {
          icon: "customIcon"
        }
      })
    ]),
    packed: projectDir => {
      assertThat(platformPackager.effectivePackOptions.icon).isEqualTo(path.join(projectDir, "customIcon.ico"))
      return BluebirdPromise.resolve()
    },
  })
})

class CheckingWinPackager extends WinPackager {
  effectiveDistOptions: any
  signOptions: SignOptions | null

  effectivePackOptions: ElectronPackagerOptions

  constructor(info: BuildInfo, cleanupTasks: Array<() => Promise<any>>) {
    super(info, cleanupTasks)
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    // skip pack
    const appOutDir = this.computeAppOutDir(outDir, arch)

    this.effectivePackOptions = await this.computePackOptions()

    const helperClass: typeof SquirrelWindowsTarget = require("out/targets/squirrelWindows").default
    this.effectiveDistOptions = await (new helperClass(this).computeEffectiveDistOptions(appOutDir, "foo", "Foo.exe"))

    await this.sign(appOutDir)
  }

  packageInDistributableFormat(outDir: string, appOutDir: string, arch: Arch, targets: Array<Target>, promises: Array<Promise<any>>): void {
    // skip
  }

  protected doSign(opts: SignOptions): Promise<any> {
    this.signOptions = opts
    return BluebirdPromise.resolve(null)
  }
}