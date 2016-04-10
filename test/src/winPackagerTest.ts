///<reference path="helpers/packTester.ts"/>
import test from "./helpers/avaEx"
import { assertPack, platform } from "./helpers/packTester"
import { move } from "fs-extra-p"
import * as path from "path"
import { WinPackager, computeDistOut } from "out/winPackager"
import { BuildInfo } from "out/platformPackager"
import { Promise as BluebirdPromise } from "bluebird"
import * as assertThat from "should/as-function"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifNotTravis("win", () => assertPack("test-app-one", {
    platform: ["win32"],
  }
  // {
  //   tempDirCreated: it => modifyPackageJson(it, data => {
  //     data.build.win = {
  //       remoteReleases: "https://github.com/develar/__test-app-releases",
  //     }
  //   })
  // }
))

test("detect install-spinner", () => {
  let platformPackager: CheckingWinPackager = null
  let loadingGifPath: string = null
  return assertPack("test-app-one", {
    platform: ["win32"],
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingWinPackager(packager, cleanupTasks),
  }, {
    tempDirCreated: it => {
      loadingGifPath = path.join(it, "build", "install-spinner.gif")
      return move(path.join(it, "install-spinner.gif"), loadingGifPath)
    },
    packed: () => {
      assertThat(platformPackager.effectiveDistOptions.loadingGif).equal(loadingGifPath)
      return BluebirdPromise.resolve(null)
    },
  })
})

test.ifNotTravis("icon < 256", (t: any) => t.throws(assertPack("test-app-one", platform("win32"), {
  tempDirCreated: projectDir => move(path.join(projectDir, "build", "incorrect.ico"), path.join(projectDir, "build", "icon.ico"), {clobber: true})
}), /Windows icon image size must be at least 256x256/))

class CheckingWinPackager extends WinPackager {
  effectiveDistOptions: any

  constructor(info: BuildInfo, cleanupTasks: Array<() => Promise<any>>) {
    super(info, cleanupTasks)
  }

  async pack(outDir: string, appOutDir: string, arch: string): Promise<any> {
    // skip pack
  }

  async packageInDistributableFormat(outDir: string, appOutDir: string, arch: string): Promise<any> {
    const installerOutDir = computeDistOut(outDir, arch)
    this.effectiveDistOptions = await this.computeEffectiveDistOptions(appOutDir, installerOutDir)
  }
}