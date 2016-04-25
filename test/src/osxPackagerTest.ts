import test from "./helpers/avaEx"
import { assertPack, platform, modifyPackageJson } from "./helpers/packTester"
import { Platform } from "out"
import OsXPackager from "out/macPackager"
import { move } from "fs-extra-p"
import * as path from "path"
import { BuildInfo } from "out/platformPackager"
import { Promise as BluebirdPromise } from "bluebird"
import * as assertThat from "should/as-function"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifOsx("two-package", () => assertPack("test-app", {
  platform: [Platform.OSX],
  arch: "all",
}))

test.ifOsx("one-package", () => assertPack("test-app-one", platform(Platform.OSX)))

function createTargetTest(target: string, expectedContents: Array<string>) {
  return () => assertPack("test-app-one", {
    platform: [Platform.OSX],
    devMetadata: {
      build: {
        osx: {
          target: [target]
        }
      }
    }
  }, {
    useTempDir: true,
    expectedContents: expectedContents
  })
}

test.ifOsx("only dmg", createTargetTest("dmg", ["TestApp-1.1.0.dmg"]))
test.ifOsx("only zip", createTargetTest("zip", ["TestApp-1.1.0-mac.zip"]))
test.ifOsx("invalid target", (t: any) => t.throws(createTargetTest("ttt", [])(), "Unknown target: ttt"))

test.ifOsx("mas", createTargetTest("mas", ["TestApp-1.1.0.pkg"]))

// test.ifOsx("no background", (t: any) => assertPack("test-app-one", platform(Platform.OSX), {
//   tempDirCreated: projectDir => deleteFile(path.join(projectDir, "build", "background.png"))
// }))

test.ifOsx("custom background", () => {
  let platformPackager: CheckingOsXPackager = null
  const customBackground = "customBackground.png"
  return assertPack("test-app-one", {
    platform: [Platform.OSX],
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingOsXPackager(packager, cleanupTasks)
  }, {
    tempDirCreated: projectDir => BluebirdPromise.all([
      move(path.join(projectDir, "build", "background.png"), path.join(projectDir, customBackground)),
      modifyPackageJson(projectDir, data => {
        data.build.osx = {
          background: customBackground,
          icon: "foo.icns",
        }
      })
    ]),
    packed: () => {
      assertThat(platformPackager.effectiveDistOptions.background).equal(customBackground)
      assertThat(platformPackager.effectiveDistOptions.icon).equal("foo.icns")
      return BluebirdPromise.resolve(null)
    },
  })
})

class CheckingOsXPackager extends OsXPackager {
  effectiveDistOptions: any

  constructor(info: BuildInfo, cleanupTasks: Array<() => Promise<any>>) {
    super(info, cleanupTasks)
  }

  async pack(outDir: string, arch: string): Promise<string> {
    // skip pack
    return this.computeAppOutDir(outDir, arch)
  }

  async packageInDistributableFormat(outDir: string, appOutDir: string, arch: string): Promise<any> {
    this.effectiveDistOptions = await this.computeEffectiveDistOptions(appOutDir)
  }
}