import { Platform, Arch, BuildInfo } from "out"
import test from "./helpers/avaEx"
import { assertPack, platform, modifyPackageJson, getTestAsset, app } from "./helpers/packTester"
import { outputFile, rename, copy } from "fs-extra-p"
import * as path from "path"
import { WinPackager } from "out/winPackager"
import { Promise as BluebirdPromise } from "bluebird"
import { assertThat } from "./helpers/fileAssert"
import { SignOptions } from "out/windowsCodeSign"
import SquirrelWindowsTarget from "out/targets/squirrelWindows"
import { Target } from "out/platformPackager"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

test.ifNotCiOsx("win", app({targets: Platform.WINDOWS.createTarget(["default", "zip"])}, {signed: true}))

// very slow
test.skip("delta and msi", app({
  targets: Platform.WINDOWS.createTarget(null, Arch.ia32),
  devMetadata: {
    build: {
      win: {
        remoteReleases: "https://github.com/develar/__test-app-releases",
        msi: true,
      },
    }
  },
}))

test.ifDevOrWinCi("beta version", app({
  targets: Platform.WINDOWS.createTarget(["squirrel", "nsis"]),
  devMetadata: <any>{
    version: "3.0.0-beta.2",
  }
}))

test.ifNotCiOsx("msi as string", t => t.throws(assertPack("test-app-one", platform(Platform.WINDOWS),
  {
    projectDirCreated: it => modifyPackageJson(it, data => {
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
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingWinPackager(packager),
    devMetadata: {
      build: {
        win: {
          certificatePassword: "pass",
        }
      }
    }
  }, {
    projectDirCreated: it => {
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

test.ifNotCiOsx("icon < 256", t => t.throws(assertPack("test-app-one", platform(Platform.WINDOWS), {
  projectDirCreated: projectDir => rename(path.join(projectDir, "build", "incorrect.ico"), path.join(projectDir, "build", "icon.ico"))
}), /Windows icon size must be at least 256x256, please fix ".+/))

test.ifNotCiOsx("icon not an image", t => t.throws(assertPack("test-app-one", platform(Platform.WINDOWS), {
  projectDirCreated: projectDir => outputFile(path.join(projectDir, "build", "icon.ico"), "foo")
}), /Windows icon is not valid ico file, please fix ".+/))

test.ifOsx("custom icon", () => {
  let platformPackager: CheckingWinPackager = null
  return assertPack("test-app-one", {
    targets: Platform.WINDOWS.createTarget(),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingWinPackager(packager)
  }, {
    projectDirCreated: projectDir => BluebirdPromise.all([
      rename(path.join(projectDir, "build", "icon.ico"), path.join(projectDir, "customIcon.ico")),
      modifyPackageJson(projectDir, data => {
        data.build.win = {
          icon: "customIcon"
        }
      })
    ]),
    packed: async context => {
      assertThat(await platformPackager.getIconPath()).isEqualTo(path.join(context.projectDir, "customIcon.ico"))
      return BluebirdPromise.resolve()
    },
  })
})

test.ifNotWindows("ev", t => t.throws(assertPack("test-app-one", {
  targets: Platform.WINDOWS.createTarget(["dir"]),
  devMetadata: {
    build: {
      win: {
        certificateSubjectName: "ev",
      }
    }
  }
}), /certificateSubjectName supported only on Windows/))

class CheckingWinPackager extends WinPackager {
  effectiveDistOptions: any
  signOptions: SignOptions | null

  constructor(info: BuildInfo) {
    super(info)
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    // skip pack
    const helperClass: typeof SquirrelWindowsTarget = require("out/targets/squirrelWindows").default
    this.effectiveDistOptions = await (new helperClass(this).computeEffectiveDistOptions())

    await this.sign(this.computeAppOutDir(outDir, arch))
  }

  packageInDistributableFormat(outDir: string, appOutDir: string, arch: Arch, targets: Array<Target>, promises: Array<Promise<any>>): void {
    // skip
  }

  protected doSign(opts: SignOptions): Promise<any> {
    this.signOptions = opts
    return BluebirdPromise.resolve(null)
  }
}