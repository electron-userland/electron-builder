import test from "./helpers/avaEx"
import { assertPack, platform, modifyPackageJson, signed } from "./helpers/packTester"
import OsXPackager from "out/macPackager"
import { move, writeFile, deleteFile, remove } from "fs-extra-p"
import * as path from "path"
import { BuildInfo, PackagerOptions } from "out/platformPackager"
import { Promise as BluebirdPromise } from "bluebird"
import * as assertThat from "should/as-function"
import { ElectronPackagerOptions } from "electron-packager-tf"
import { Platform, MacOptions, createTargets } from "out"
import { SignOptions, FlatOptions } from "electron-osx-sign-tf"
import { Arch } from "out"
import { Target } from "out/platformPackager"
import { DmgTarget } from "out/targets/dmg"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

test.ifOsx("two-package", () => assertPack("test-app", signed({
  targets: createTargets([Platform.MAC], null, "all"),
})))

test.ifOsx("one-package", () => assertPack("test-app-one", signed(platform(Platform.MAC))))

function createTargetTest(target: Array<string>, expectedContents: Array<string>) {
  let options: PackagerOptions = {
    targets: Platform.MAC.createTarget(),
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

test.ifOsx("only dmg", createTargetTest(["dmg"], ["Test App AB-1.1.0.dmg"]))
test.ifOsx("only zip", createTargetTest(["zip"], ["Test App AB-1.1.0-mac.zip"]))
test.ifOsx("invalid target", (t: any) => t.throws(createTargetTest(["ttt"], [])(), "Unknown target: ttt"))

test.ifOsx("mas", createTargetTest(["mas"], ["Test App AB-1.1.0.pkg"]))
test.ifOsx("mas and 7z", createTargetTest(["mas", "7z"], ["Test App AB-1.1.0-mac.7z", "Test App AB-1.1.0.pkg"]))

test.ifOsx("custom mas", () => {
  let platformPackager: CheckingOsXPackager = null
  return assertPack("test-app-one", signed({
    targets: Platform.MAC.createTarget(),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingOsXPackager(packager, cleanupTasks),
    devMetadata: {
      build: {
        mac: {
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
    targets: Platform.MAC.createTarget(),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingOsXPackager(packager, cleanupTasks),
    devMetadata: {
      build: {
        mac: {
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
    targets: Platform.MAC.createTarget(),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingOsXPackager(packager, cleanupTasks),
  }), {
    tempDirCreated: projectDir => BluebirdPromise.all([
      writeFile(path.join(projectDir, "build", "entitlements.osx.plist"), ""),
      writeFile(path.join(projectDir, "build", "entitlements.osx.inherit.plist"), ""),
    ]),
    packed: projectDir => {
      assertThat(platformPackager.effectiveSignOptions).has.properties({
        entitlements: path.join(projectDir, "build", "entitlements.osx.plist"),
        "entitlements-inherit": path.join(projectDir, "build", "entitlements.osx.inherit.plist"),
      })
      return BluebirdPromise.resolve(null)
    }
  })
})

test.ifOsx("no background", (t: any) => assertPack("test-app-one", platform(Platform.MAC), {
  tempDirCreated: projectDir => deleteFile(path.join(projectDir, "build", "background.png"))
}))

test.ifOsx("no build directory", (t: any) => assertPack("test-app-one", platform(Platform.MAC), {
  tempDirCreated: projectDir => remove(path.join(projectDir, "build"))
}))

test.ifOsx("custom background - old way", () => {
  let platformPackager: CheckingOsXPackager = null
  const customBackground = "customBackground.png"
  return assertPack("test-app-one", {
    targets: Platform.MAC.createTarget(),
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

test.ifOsx("custom background - new way", () => {
  let platformPackager: CheckingOsXPackager = null
  const customBackground = "customBackground.png"
  return assertPack("test-app-one", {
    targets: Platform.MAC.createTarget(),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingOsXPackager(packager, cleanupTasks)
  }, {
    tempDirCreated: projectDir => BluebirdPromise.all([
      move(path.join(projectDir, "build", "background.png"), path.join(projectDir, customBackground)),
      modifyPackageJson(projectDir, data => {
        data.build.mac = {
          icon: "customIcon"
        }

        data.build.dmg = {
          background: customBackground,
          icon: "foo.icns",
        }

        data.build.osx = {
          background: null,
          icon: "ignoreMe.icns",
        }
      })
    ]),
    packed: projectDir => {
      assertThat(platformPackager.effectiveDistOptions.background).equal(customBackground)
      assertThat(platformPackager.effectiveDistOptions.icon).equal("foo.icns")
      assertThat(platformPackager.effectivePackOptions.icon).equal(path.join(projectDir, "customIcon.icns"))
      return BluebirdPromise.resolve(null)
    },
  })
})

class CheckingOsXPackager extends OsXPackager {
  effectiveDistOptions: any
  effectivePackOptions: ElectronPackagerOptions
  effectiveSignOptions: SignOptions
  effectiveFlatOptions: FlatOptions

  constructor(info: BuildInfo, cleanupTasks: Array<() => Promise<any>>) {
    super(info, cleanupTasks)
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    for (let target of targets) {
      // do not use instanceof to avoid dmg require
      if (target.name === "dmg") {
        this.effectiveDistOptions = await (<DmgTarget>target).computeDmgOptions(outDir)
        break
      }
    }
    return await super.pack(outDir, arch, targets, postAsyncTasks)
  }

  async doPack(options: ElectronPackagerOptions, outDir: string, appOutDir: string, arch: Arch, customBuildOptions: MacOptions, postAsyncTasks: Array<Promise<any>> = null) {
    this.effectivePackOptions = options
  }

  async doSign(opts: SignOptions): Promise<any> {
    this.effectiveSignOptions = opts
  }

  async doFlat(opts: FlatOptions): Promise<any> {
    this.effectiveFlatOptions = opts
  }

  packageInDistributableFormat(appOutDir: string, targets: Array<Target>, promises: Array<Promise<any>>): void {
    // skip
  }
}