import { Platform, Arch, BuildInfo } from "out"
import test from "./helpers/avaEx"
import { assertPack, platform, modifyPackageJson, signed } from "./helpers/packTester"
import { move, outputFile } from "fs-extra-p"
import * as path from "path"
import { WinPackager, computeDistOut } from "out/winPackager"
import { Promise as BluebirdPromise } from "bluebird"
import { ElectronPackagerOptions } from "electron-packager-tf"
import { assertThat } from "./helpers/fileAssert"
import { SignOptions } from "signcode-tf"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifDevOrWinCi("win", () => assertPack("test-app-one", signed({
    targets: Platform.WINDOWS.createTarget(),
  })
))

// test.ifNotCiOsx("win 32", () => assertPack("test-app-one", signed({
//     targets: Platform.WINDOWS.createTarget(null, Arch.ia32),
//   })
// ))

// very slow
test.ifWinCi("delta", () => assertPack("test-app-one", {
    targets: Platform.WINDOWS.createTarget(null, Arch.ia32),
    devMetadata: {
      build: {
        win: {
          remoteReleases: "https://github.com/develar/__test-app-releases",
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
    targets: Platform.WINDOWS.createTarget(),
    devMetadata: metadata
  }, {
    expectedArtifacts: [
      "RELEASES",
      "TestApp Setup 3.0.0-beta.2.exe",
      "TestApp-3.0.0-beta2-full.nupkg"
    ]
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
        move(path.join(it, "install-spinner.gif"), loadingGifPath),
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
  tempDirCreated: projectDir => move(path.join(projectDir, "build", "incorrect.ico"), path.join(projectDir, "build", "icon.ico"), {clobber: true})
}), /Windows icon size must be at least 256x256, please fix ".+/))

test.ifNotCiOsx("icon not an image", (t: any) => t.throws(assertPack("test-app-one", platform(Platform.WINDOWS), {
  tempDirCreated: projectDir => outputFile(path.join(projectDir, "build", "icon.ico"), "foo")
}), /Windows icon is not valid ico file, please fix ".+/))

class CheckingWinPackager extends WinPackager {
  effectiveDistOptions: any
  signOptions: SignOptions | null

  constructor(info: BuildInfo, cleanupTasks: Array<() => Promise<any>>) {
    super(info, cleanupTasks)
  }

  async pack(outDir: string, arch: Arch, targets: Array<string>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    // skip pack
    const installerOutDir = computeDistOut(outDir, arch)
    const appOutDir = this.computeAppOutDir(outDir, arch)
    const packOptions = this.computePackOptions(outDir, appOutDir, arch)
    this.effectiveDistOptions = await this.computeEffectiveDistOptions(appOutDir, installerOutDir, packOptions, "Foo.exe")

    await this.sign(appOutDir)
  }

  async packageInDistributableFormat(appOutDir: string, installerOutDir: string, arch: Arch, packOptions: ElectronPackagerOptions): Promise<any> {
    // skip
  }

  protected doSign(opts: SignOptions): Promise<any> {
    this.signOptions = opts
    return BluebirdPromise.resolve(null)
  }
}