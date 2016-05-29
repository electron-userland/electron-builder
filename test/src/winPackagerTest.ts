import { Platform } from "out"
import test from "./helpers/avaEx"
import { assertPack, platform, modifyPackageJson, signed } from "./helpers/packTester"
import { move, outputFile } from "fs-extra-p"
import * as path from "path"
import { WinPackager, computeDistOut } from "out/winPackager"
import { BuildInfo } from "out/platformPackager"
import { Promise as BluebirdPromise } from "bluebird"
import * as assertThat from "should/as-function"
import { ElectronPackagerOptions } from "electron-packager-tf"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifNotCiOsx("win", () => assertPack("test-app-one", signed({
    platform: [Platform.WINDOWS],
    arch: "x64",
  })
))

// very slow
test.ifWinCi("delta", () => assertPack("test-app-one", {
    platform: [Platform.WINDOWS],
    arch: "ia32",
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
    platform: [Platform.WINDOWS],
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

test("detect install-spinner", () => {
  let platformPackager: CheckingWinPackager = null
  let loadingGifPath: string = null

  // todo all PackagerOptions should be optional otherwise it is not possible to pass only several to override dev package.json
  const devMetadata: any = {
    build: {
      win: {
        certificatePassword: "pass",
      }
    }
  }
  return assertPack("test-app-one", {
    platform: [Platform.WINDOWS],
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingWinPackager(packager, cleanupTasks),
    devMetadata: devMetadata
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
      assertThat(platformPackager.effectiveDistOptions.loadingGif).equal(loadingGifPath)
      assertThat(platformPackager.effectiveDistOptions.certificateFile).equal("secretFile")
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

  constructor(info: BuildInfo, cleanupTasks: Array<() => Promise<any>>) {
    super(info, cleanupTasks)
  }

  async pack(outDir: string, arch: string): Promise<any> {
    // skip pack
    const installerOutDir = computeDistOut(outDir, arch)
    const appOutDir = this.computeAppOutDir(outDir, arch)
    const packOptions = this.computePackOptions(outDir, appOutDir, arch)
    this.effectiveDistOptions = await this.computeEffectiveDistOptions(appOutDir, installerOutDir, packOptions, "Foo.exe")
  }

  async packageInDistributableFormat(appOutDir: string, installerOutDir: string, arch: string, packOptions: ElectronPackagerOptions): Promise<any> {
    // skip
  }
}