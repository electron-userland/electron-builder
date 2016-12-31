import { assertPack, modifyPackageJson, app, CheckingMacPackager } from "../helpers/packTester"
import { remove, copy } from "fs-extra-p"
import * as path from "path"
import BluebirdPromise from "bluebird-lst-c"
import { assertThat } from "../helpers/fileAssert"
import { Platform } from "electron-builder"
import { attachAndExecute } from "electron-builder/out/targets/dmg"

test.ifMac("no build directory", app({
  targets: Platform.MAC.createTarget("dmg"),
  config: {
    // dmg can mount only one volume name, so, to test in parallel, we set different product name
    productName: "NoBuildDirectory",
  },
  effectiveOptionComputed: async it => {
    const volumePath = it[0]
    const specification = it[1]
    await assertThat(path.join(volumePath, ".background", "background.tiff")).isFile()
    await assertThat(path.join(volumePath, "Applications")).isSymbolicLink()
    expect(specification.contents).toMatchSnapshot()
    return false
  },
}, {
  expectedContents: ["NoBuildDirectory-1.1.0.dmg"],
  projectDirCreated: projectDir => remove(path.join(projectDir, "build")),
}))

test.ifMac("custom background - new way", () => {
  let platformPackager: CheckingMacPackager = null
  const customBackground = "customBackground.png"
  return assertPack("test-app-one", {
    targets: Platform.MAC.createTarget(),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingMacPackager(packager)
  }, {
    projectDirCreated: projectDir => BluebirdPromise.all([
      copy(path.join(__dirname, "..", "..", "..", "packages", "electron-builder", "templates", "dmg", "background.tiff"), path.join(projectDir, customBackground)),
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
      expect(platformPackager.effectiveDistOptions.background).toEqual(customBackground)
      expect(platformPackager.effectiveDistOptions.icon).toEqual("foo.icns")
      expect(await platformPackager.getIconPath()).toEqual(path.join(context.projectDir, "customIcon.icns"))
    },
  })
})

test.ifMac("no Applications link", () => {
  return assertPack("test-app-one", {
    targets: Platform.MAC.createTarget(),
    config: {
      productName: "NoApplicationsLink",
      dmg: {
        "contents": [
          {
            "x": 110,
            "y": 150
          },
          {
            "x": 410,
            "y": 440,
            "type": "link",
            "path": "/Applications/TextEdit.app"
          }
        ],
      },
    },
    effectiveOptionComputed: async it => {
      const volumePath = it[0]
      const specification = it[1]
      await BluebirdPromise.all([
        assertThat(path.join(volumePath, ".background", "background.tiff")).isFile(),
        assertThat(path.join(volumePath, "Applications")).doesNotExist(),
        assertThat(path.join(volumePath, "TextEdit.app")).isSymbolicLink(),
        assertThat(path.join(volumePath, "TextEdit.app")).isDirectory(),
      ])
      expect(specification.contents).toMatchSnapshot()
      return false
    },
  })
})

test.ifMac("unset dmg icon", app({
  targets: Platform.MAC.createTarget("dmg"),
  config: {
    // dmg can mount only one volume name, so, to test in parallel, we set different product name
    productName: "Test ß No Volume Icon",
    dmg: {
      icon: null,
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

// test also "only dmg"
test.ifMac("no background", app({
  targets: Platform.MAC.createTarget("dmg"),
  config: {
    // dmg can mount only one volume name, so, to test in parallel, we set different product name
    productName: "NoBackground",
    dmg: {
      background: null,
      title: "Foo",
    }
  }
}, {
  expectedContents: ["NoBackground-1.1.0.dmg"],
  packed: (context) => {
    return attachAndExecute(path.join(context.outDir, "mac/NoBackground-1.1.0.dmg"), false, () => {
      return assertThat(path.join("/Volumes/NoBackground 1.1.0/.background")).doesNotExist()
    })
  }
}))

test.ifMac("disable dmg icon (light), bundleVersion", () => {
  let platformPackager: CheckingMacPackager = null
  return assertPack("test-app-one", {
    targets: Platform.MAC.createTarget(),
    platformPackagerFactory: (packager, platform, cleanupTasks) => platformPackager = new CheckingMacPackager(packager),
    config: {
      dmg: {
        icon: null,
      },
      mac: {
        bundleVersion: "50"
      },
    }
  }, {
    packed: async () => {
      expect(platformPackager.effectiveDistOptions.icon).toBeNull()
      expect(await platformPackager.getIconPath()).not.toBeNull()
      expect(platformPackager.appInfo.buildVersion).toEqual("50")
    },
  })
})