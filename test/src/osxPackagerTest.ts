import test from "./helpers/avaEx"
import { assertPack, platform, modifyPackageJson, signed } from "./helpers/packTester"
import { Platform } from "out"
import OsXPackager from "out/osxPackager"
import { move, writeFile, deleteFile, remove } from "fs-extra-p"
import * as path from "path"
import { BuildInfo, PackagerOptions } from "out/platformPackager"
import { Promise as BluebirdPromise } from "bluebird"
import * as assertThat from "should/as-function"
import { ElectronPackagerOptions } from "electron-packager-tf"
import { OsXBuildOptions } from "out/metadata"
import { SignOptions, FlatOptions } from "electron-osx-sign-tf"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test.ifOsx("two-package", () => assertPack("test-app", signed({
  platform: [Platform.OSX],
  arch: "all",
})))

test.ifOsx("one-package", () => assertPack("test-app-one", signed(platform(Platform.OSX))))

function createTargetTest(target: Array<string>, expectedContents: Array<string>) {
  let options: PackagerOptions = {
    platform: [Platform.OSX],
    devMetadata: {
      build: {
        osx: {
          target: target
        }
      }
    }
  }
  if (target.includes("mas")) {
    options = signed(options)
  }

  return () => assertPack("test-app-one", options, {
    expectedContents: expectedContents
  })
}

test.ifOsx("only dmg", createTargetTest(["dmg"], ["TestApp-1.1.0.dmg"]))
test.ifOsx("only zip", createTargetTest(["zip"], ["TestApp-1.1.0-osx.zip"]))
test.ifOsx("invalid target", (t: any) => t.throws(createTargetTest(["ttt"], [])(), "Unknown target: ttt"))

test.ifOsx("mas", createTargetTest(["mas"], ["TestApp-1.1.0.pkg"]))
test.ifOsx("mas and 7z", createTargetTest(["mas", "7z"], ["TestApp-1.1.0-osx.7z", "TestApp-1.1.0.pkg"]))

test.ifOsx("custom mas", () => {
  let platformPackager: CheckingOsXPackager = null
  return assertPack("test-app-one", signed({
    platform: [Platform.OSX],
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingOsXPackager(packager, cleanupTasks),
    devMetadata: {
      build: {
        osx: {
          target: ["mas"],
          identity: "Test Test",
        },
        mas: {
          entitlements: "mas-entitlements file path",
          entitlementsInherit: "mas-entitlementsInherit file path",
        }
      }
    }
  }), {
    packed: () => {
      assertThat(platformPackager.effectiveSignOptions).has.properties({
        identity: "Test Test",
        entitlements: "mas-entitlements file path",
        "entitlements-inherit": "mas-entitlementsInherit file path",
      })
      return BluebirdPromise.resolve(null)
    }
  })
})

test.ifOsx("entitlements in the package.json", () => {
  let platformPackager: CheckingOsXPackager = null
  return assertPack("test-app-one", signed({
    platform: [Platform.OSX],
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingOsXPackager(packager, cleanupTasks),
    devMetadata: {
      build: {
        osx: {
          entitlements: "osx-entitlements file path",
          entitlementsInherit: "osx-entitlementsInherit file path",
        }
      }
    }
  }), {
    packed: () => {
      assertThat(platformPackager.effectiveSignOptions).has.properties({
        entitlements: "osx-entitlements file path",
        "entitlements-inherit": "osx-entitlementsInherit file path",
      })
      return BluebirdPromise.resolve(null)
    }
  })
})

test.ifOsx("entitlements in build dir", () => {
  let platformPackager: CheckingOsXPackager = null
  return assertPack("test-app-one", signed({
    platform: [Platform.OSX],
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingOsXPackager(packager, cleanupTasks),
  }), {
    tempDirCreated: projectDir => BluebirdPromise.all([
      writeFile(path.join(projectDir, "build", "osx.entitlements"), ""),
      writeFile(path.join(projectDir, "build", "osx.inherit.entitlements"), ""),
    ]),
    packed: projectDir => {
      assertThat(platformPackager.effectiveSignOptions).has.properties({
        entitlements: path.join(projectDir, "build", "osx.entitlements"),
        "entitlements-inherit": path.join(projectDir, "build", "osx.inherit.entitlements"),
      })
      return BluebirdPromise.resolve(null)
    }
  })
})

test.ifOsx("no background", (t: any) => assertPack("test-app-one", platform(Platform.OSX), {
  tempDirCreated: projectDir => deleteFile(path.join(projectDir, "build", "background.png"))
}))

test.ifOsx("no build directory", (t: any) => assertPack("test-app-one", platform(Platform.OSX), {
  tempDirCreated: projectDir => remove(path.join(projectDir, "build"))
}))

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
  effectiveSignOptions: SignOptions
  effectiveFlatOptions: FlatOptions

  constructor(info: BuildInfo, cleanupTasks: Array<() => Promise<any>>) {
    super(info, cleanupTasks)
  }

  async doPack(options: ElectronPackagerOptions, outDir: string, appOutDir: string, arch: string, customBuildOptions: OsXBuildOptions, postAsyncTasks: Array<Promise<any>> = null) {
    // skip pack
    this.effectiveDistOptions = await this.computeEffectiveDistOptions(this.computeAppOutDir(outDir, arch))
  }

  async doSign(opts: SignOptions): Promise<any> {
    this.effectiveSignOptions = opts
  }

  async doFlat(opts: FlatOptions): Promise<any> {
    this.effectiveFlatOptions = opts
  }

  async packageInDistributableFormat(outDir: string, appOutDir: string, arch: string): Promise<any> {
    // skip
  }
}