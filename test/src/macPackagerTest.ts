import test from "./helpers/avaEx"
import { assertPack, platform, modifyPackageJson, signed, app, appThrows } from "./helpers/packTester"
import OsXPackager from "out/macPackager"
import { writeFile, remove, copy, mkdir } from "fs-extra-p"
import * as path from "path"
import { BuildInfo } from "out/platformPackager"
import BluebirdPromise from "bluebird-lst-c"
import { assertThat } from "./helpers/fileAssert"
import { Platform, MacOptions, createTargets } from "out"
import { SignOptions } from "electron-macos-sign"
import { Arch } from "out"
import { Target } from "out/platformPackager"
import { DmgTarget } from "out/targets/dmg"
import { DIR_TARGET } from "out/targets/targetFactory"
import { attachAndExecute } from "out/targets/dmg"
import { getTempName } from "out/util/util"
import { exec } from "out/util/util"
import { MacOsTargetName } from "out/options/macOptions"

test.ifOsx("two-package", () => assertPack("test-app", {targets: createTargets([Platform.MAC], null, "all")}, {signed: true, useTempDir: true}))

test.ifOsx("one-package", app(platform(Platform.MAC), {signed: true}))

function createTargetTest(target: Array<MacOsTargetName>, expectedContents: Array<string>) {
  return app({
    targets: Platform.MAC.createTarget(),
    devMetadata: {
      build: {
        mac: {
          target: target,
        }
      }
    }
  }, {
    useTempDir: true,
    expectedContents: expectedContents,
    signed: target.includes("mas") || target.includes("pkg"),
    packed: async (context) => {
      if (!target.includes("tar.gz")) {
        return
      }

      const tempDir = path.join(context.outDir, getTempName())
      await mkdir(tempDir)
      await exec("tar", ["xf", path.join(context.outDir, "mac", "Test App ßW-1.1.0-mac.tar.gz")], {cwd: tempDir})
      await assertThat(path.join(tempDir, "Test App ßW.app")).isDirectory()
    }
  })
}

test("only zip", createTargetTest(["zip"], ["Test App ßW-1.1.0-mac.zip"]))

test.ifOsx("pkg", createTargetTest(["pkg"], ["Test App ßW-1.1.0.pkg"]))

test("tar.gz", createTargetTest(["tar.gz"], ["Test App ßW-1.1.0-mac.tar.gz"]))

// todo failed on Travis CI
//test("tar.xz", createTargetTest(["tar.xz"], ["Test App ßW-1.1.0-mac.tar.xz"]))

test.ifOsx("invalid target", t => t.throws(createTargetTest([<any>"ttt"], [])(), "Unknown target: ttt"))

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

// test also "only dmg"
test.ifOsx("no background", app({
  targets: Platform.MAC.createTarget("dmg"),
  devMetadata: {
    build: {
      // dmg can mount only one volume name, so, to test in parallel, we set different product name
      productName: "Test ß",
      dmg: {
        background: null,
        title: "Foo",
      },
    }
  }
}, {
  expectedContents: ["Test ß-1.1.0.dmg"],
  packed: (context) => {
    return attachAndExecute(path.join(context.outDir, "mac/Test ß-1.1.0.dmg"), false, () => {
      return assertThat(path.join("/Volumes/Test ß 1.1.0/.background")).doesNotExist()
    })
  }
}))

test.ifOsx("unset dmg icon", app({
  targets: Platform.MAC.createTarget("dmg"),
  devMetadata: {
    build: {
      // dmg can mount only one volume name, so, to test in parallel, we set different product name
      productName: "Test ß No Volume Icon",
      dmg: {
        icon: null,
      },
    }
  }
}, {
  expectedContents: ["Test ß No Volume Icon-1.1.0.dmg"],
  packed: (context) => {
    return attachAndExecute(path.join(context.outDir, "mac/Test ß No Volume Icon-1.1.0.dmg"), false, () => {
      return BluebirdPromise.all([
        assertThat(path.join("/Volumes/Test ß No Volume Icon 1.1.0/.background/background.tiff")).isFile(),
        assertThat(path.join("/Volumes/Test ß No Volume Icon 1.1.0/.VolumeIcon.icns")).doesNotExist(),
      ])
    })
  }
}))

test.ifOsx("no build directory", app(platform(Platform.MAC), {
  projectDirCreated: projectDir => remove(path.join(projectDir, "build"))
}))

test.ifOsx("custom background - new way", () => {
  let platformPackager: CheckingMacPackager = null
  const customBackground = "customBackground.png"
  return assertPack("test-app-one", {
    targets: Platform.MAC.createTarget(),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingMacPackager(packager)
  }, {
    projectDirCreated: projectDir => BluebirdPromise.all([
      copy(path.join(__dirname, "..", "..", "templates", "dmg", "background.tiff"), path.join(projectDir, customBackground)),
      modifyPackageJson(projectDir, data => {
        data.build.mac = {
          icon: "customIcon"
        }

        data.build.dmg = {
          background: customBackground,
          icon: "foo.icns",
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

test.ifOsx("disable dmg icon (light), bundleVersion", () => {
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

test.ifOsx("electronDist", appThrows(/ENOENT: no such file or directory/, {
  targets: Platform.OSX.createTarget(DIR_TARGET),
}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.build.electronDist = "foo"
  })
}))

class CheckingMacPackager extends OsXPackager {
  effectiveDistOptions: any
  effectiveSignOptions: SignOptions

  constructor(info: BuildInfo) {
    super(info)
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    for (let target of targets) {
      // do not use instanceof to avoid dmg require
      if (target.name === "dmg") {
        this.effectiveDistOptions = await (<DmgTarget>target).computeDmgOptions()
        break
      }
    }
    // http://madole.xyz/babel-plugin-transform-async-to-module-method-gotcha/
    return await OsXPackager.prototype.pack.call(this, outDir, arch, targets, postAsyncTasks)
  }

  async doPack(outDir: string, appOutDir: string, platformName: string, arch: Arch, customBuildOptions: MacOptions, postAsyncTasks: Array<Promise<any>> = null) {
    // skip
  }

  async doSign(opts: SignOptions): Promise<any> {
    this.effectiveSignOptions = opts
  }

  async doFlat(appPath: string, outFile: string, identity: string, keychain?: string | null): Promise<any> {
    // skip
  }

  packageInDistributableFormat(appOutDir: string, targets: Array<Target>, promises: Array<Promise<any>>): void {
    // skip
  }
}