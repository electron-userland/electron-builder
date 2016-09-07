import test from "./helpers/avaEx"
import { assertPack, platform, modifyPackageJson, signed, app } from "./helpers/packTester"
import OsXPackager from "out/macPackager"
import { move, writeFile, deleteFile, remove } from "fs-extra-p"
import * as path from "path"
import { BuildInfo } from "out/platformPackager"
import { Promise as BluebirdPromise } from "bluebird"
import { assertThat } from "./helpers/fileAssert"
import { Platform, MacOptions, createTargets } from "out"
import { SignOptions, FlatOptions } from "electron-osx-sign"
import { Arch } from "out"
import { Target } from "out/platformPackager"
import { DmgTarget } from "out/targets/dmg"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

test.ifOsx("two-package", () => assertPack("test-app", {targets: createTargets([Platform.MAC], null, "all")}, {signed: true, useTempDir: true}))

test.ifOsx("one-package", app(platform(Platform.MAC), {signed: true}))

function createTargetTest(target: Array<string>, expectedContents: Array<string>) {
  return app({
    targets: Platform.MAC.createTarget(),
    devMetadata: {
      build: {
        mac: {
          target: target,
        }
      }
    }
  }, {expectedContents: expectedContents, signed: target.includes("mas")})
}

test.ifOsx("only dmg", createTargetTest(["dmg"], ["Test App ßW-1.1.0.dmg"]))
test("only zip", createTargetTest(["zip"], ["Test App ßW-1.1.0-mac.zip"]))
test.ifOsx("invalid target", t => t.throws(createTargetTest(["ttt"], [])(), "Unknown target: ttt"))

if (process.env.CSC_KEY_PASSWORD == null || process.platform !== "darwin") {
  console.warn("Skip mas tests because CSC_KEY_PASSWORD is not defined")
}
else {
  test.ifOsx("mas", createTargetTest(["mas"], ["Test App ßW-1.1.0.pkg"]))
  test.ifOsx("mas and 7z", createTargetTest(["mas", "7z"], ["Test App ßW-1.1.0-mac.7z", "Test App ßW-1.1.0.pkg"]))

  test.ifOsx("custom mas", () => {
    let platformPackager: CheckingMacPackager = null
    return assertPack("test-app-one", signed({
      targets: Platform.MAC.createTarget(),
      platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingMacPackager(packager),
      devMetadata: {
        build: {
          mac: {
            target: ["mas"],
          },
          mas: {
            entitlements: "mas-entitlements file path",
            entitlementsInherit: "mas-entitlementsInherit file path",
          }
        }
      }
    }), {
      packed: () => {
        assertThat(platformPackager.effectiveSignOptions).hasProperties({
          entitlements: "mas-entitlements file path",
          "entitlements-inherit": "mas-entitlementsInherit file path",
        })
        return BluebirdPromise.resolve(null)
      }
    })
  })

  test.ifOsx("entitlements in the package.json", () => {
    let platformPackager: CheckingMacPackager = null
    return assertPack("test-app-one", signed({
      targets: Platform.MAC.createTarget(),
      platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingMacPackager(packager),
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
        assertThat(platformPackager.effectiveSignOptions).hasProperties({
          entitlements: "osx-entitlements file path",
          "entitlements-inherit": "osx-entitlementsInherit file path",
        })
        return BluebirdPromise.resolve()
      }
    })
  })

  test.ifOsx("entitlements in build dir", () => {
    let platformPackager: CheckingMacPackager = null
    return assertPack("test-app-one", signed({
      targets: Platform.MAC.createTarget(),
      platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingMacPackager(packager),
    }), {
      projectDirCreated: projectDir => BluebirdPromise.all([
        writeFile(path.join(projectDir, "build", "entitlements.mac.plist"), ""),
        writeFile(path.join(projectDir, "build", "entitlements.mac.inherit.plist"), ""),
      ]),
      packed: context => {
        assertThat(platformPackager.effectiveSignOptions).hasProperties({
          entitlements: path.join(context.projectDir, "build", "entitlements.mac.plist"),
          "entitlements-inherit": path.join(context.projectDir, "build", "entitlements.mac.inherit.plist"),
        })
        return BluebirdPromise.resolve()
      }
    })
  })
}

test.ifOsx("no background", app(platform(Platform.MAC), {
  projectDirCreated: projectDir => deleteFile(path.join(projectDir, "build", "background.png"))
}))

test.ifOsx("no build directory", app(platform(Platform.MAC), {
  projectDirCreated: projectDir => remove(path.join(projectDir, "build"))
}))

test.ifOsx("custom background - old way", () => {
  let platformPackager: CheckingMacPackager = null
  const customBackground = "customBackground.png"
  return assertPack("test-app-one", {
    targets: Platform.MAC.createTarget(),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingMacPackager(packager)
  }, {
    projectDirCreated: projectDir => BluebirdPromise.all([
      move(path.join(projectDir, "build", "background.png"), path.join(projectDir, customBackground)),
      modifyPackageJson(projectDir, data => {
        data.build.osx = {
          background: customBackground,
          icon: "foo.icns",
        }
      })
    ]),
    packed: () => {
      assertThat(platformPackager.effectiveDistOptions.background).isEqualTo(customBackground)
      assertThat(platformPackager.effectiveDistOptions.icon).isEqualTo("foo.icns")
      return BluebirdPromise.resolve(null)
    },
  })
})

test.ifOsx("custom background - new way", () => {
  let platformPackager: CheckingMacPackager = null
  const customBackground = "customBackground.png"
  return assertPack("test-app-one", {
    targets: Platform.MAC.createTarget(),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingMacPackager(packager)
  }, {
    projectDirCreated: projectDir => BluebirdPromise.all([
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
    packed: async context => {
      assertThat(platformPackager.effectiveDistOptions.background).isEqualTo(customBackground)
      assertThat(platformPackager.effectiveDistOptions.icon).isEqualTo("foo.icns")
      assertThat(await platformPackager.getIconPath()).isEqualTo(path.join(context.projectDir, "customIcon.icns"))
    },
  })
})

test.ifOsx("disable dmg icon, bundleVersion", () => {
  let platformPackager: CheckingMacPackager = null
  return assertPack("test-app-one", {
    targets: Platform.MAC.createTarget(),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingMacPackager(packager),
    devMetadata: {
      build: {
        dmg: {
          icon: null,
        },
        mac: {
          bundleVersion: "50"
        },
      },
    }
  }, {
    packed: async () => {
      assertThat(platformPackager.effectiveDistOptions.icon).isEqualTo(null)
      assertThat(await platformPackager.getIconPath()).isNotEqualTo(null)
      assertThat(platformPackager.appInfo.buildVersion).isEqualTo("50")
    },
  })
})

class CheckingMacPackager extends OsXPackager {
  effectiveDistOptions: any
  effectiveSignOptions: SignOptions
  effectiveFlatOptions: FlatOptions

  constructor(info: BuildInfo) {
    super(info)
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

  async doPack(outDir: string, appOutDir: string, platformName: string, arch: Arch, customBuildOptions: MacOptions, postAsyncTasks: Array<Promise<any>> = null) {
    // skip
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