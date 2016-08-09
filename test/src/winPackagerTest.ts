import { Platform, Arch, BuildInfo } from "out"
import test from "./helpers/avaEx"
import { assertPack, platform, modifyPackageJson, signed, getTestAsset } from "./helpers/packTester"
import { outputFile, rename, copy } from "fs-extra-p"
import * as path from "path"
import { WinPackager } from "out/winPackager"
import { Promise as BluebirdPromise } from "bluebird"
import { assertThat } from "./helpers/fileAssert"
import { SignOptions } from "out/windowsCodeSign"
import SquirrelWindowsTarget from "out/targets/squirrelWindows"
import { Target } from "out/platformPackager"
import { ElectronPackagerOptions } from "out/packager/dirPackager"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

test.ifNotCiOsx("win", () => assertPack("test-app-one", signed({
    targets: Platform.WINDOWS.createTarget(["default", "zip"]),
  })
))

// very slow
test.skip("delta and msi", () => assertPack("test-app-one", {
    targets: Platform.WINDOWS.createTarget(null, Arch.ia32),
    devMetadata: {
      build: {
        win: {
          remoteReleases: "https://github.com/develar/__test-app-releases",
          msi: true,
        },
      }
    },
  }
))

test.ifDevOrWinCi("beta version", () => {
  const metadata: any = {
    version: "3.0.0-beta.2",
    build: {
      win: {
        legalTrademarks: "My Trademark"
      },
    },
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