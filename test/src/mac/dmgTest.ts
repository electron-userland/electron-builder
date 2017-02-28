import BluebirdPromise from "bluebird-lst"
import { Platform } from "electron-builder"
import { PlatformPackager } from "electron-builder/out/platformPackager"
import { attachAndExecute } from "electron-builder/out/targets/dmg"
import { copy, remove } from "fs-extra-p"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { app, assertPack } from "../helpers/packTester"

test.ifMac("no build directory", app({
  targets: Platform.MAC.createTarget("dmg"),
  config: {
    // dmg can mount only one volume name, so, to test in parallel, we set different product name
    productName: "NoBuildDirectory",
  },
  effectiveOptionComputed: async it => {
    const volumePath = it.volumePath
    await assertThat(path.join(volumePath, ".background", "background.tiff")).isFile()
    await assertThat(path.join(volumePath, "Applications")).isSymbolicLink()
    expect(it.specification.contents).toMatchSnapshot()
    return false
  },
}, {
  projectDirCreated: projectDir => remove(path.join(projectDir, "build")),
}))

test.ifAll.ifMac("custom background - new way", () => {
  const customBackground = "customBackground.png"
  return assertPack("test-app-one", {
    targets: Platform.MAC.createTarget(),
    config: {
      mac: {
        icon: "customIcon"
      },
      dmg: {
        background: customBackground,
        icon: "foo.icns",
      },
    },
    effectiveOptionComputed: async it => {
      expect(it.specification.background).toEqual(customBackground)
      expect(it.specification.icon).toEqual("foo.icns")
      const packager: PlatformPackager<any> = it.packager
      expect(await packager.getIconPath()).toEqual(path.join(packager.projectDir, "build", "customIcon.icns"))
      return true
    },
  }, {
    projectDirCreated: projectDir => BluebirdPromise.all([
      copy(path.join(__dirname, "..", "..", "..", "packages", "electron-builder", "templates", "dmg", "background.tiff"), path.join(projectDir, customBackground)),
      // copy, but not rename to test that default icon is not used
      copy(path.join(projectDir, "build", "icon.icns"), path.join(projectDir, "build", "customIcon.icns")),
      copy(path.join(projectDir, "build", "icon.icns"), path.join(projectDir, "foo.icns")),
    ]),
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
      const volumePath = it.volumePath
      await BluebirdPromise.all([
        assertThat(path.join(volumePath, ".background", "background.tiff")).isFile(),
        assertThat(path.join(volumePath, "Applications")).doesNotExist(),
        assertThat(path.join(volumePath, "TextEdit.app")).isSymbolicLink(),
        assertThat(path.join(volumePath, "TextEdit.app")).isDirectory(),
      ])
      expect(it.specification.contents).toMatchSnapshot()
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
  packed: (context) => {
    return attachAndExecute(path.join(context.outDir, "Test ß No Volume Icon-1.1.0.dmg"), false, () => {
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
  packed: (context) => {
    return attachAndExecute(path.join(context.outDir, "NoBackground-1.1.0.dmg"), false, () => {
      return assertThat(path.join("/Volumes/NoBackground 1.1.0/.background")).doesNotExist()
    })
  }
}))

test.ifAll.ifMac("disable dmg icon (light), bundleVersion", () => {
  return assertPack("test-app-one", {
    targets: Platform.MAC.createTarget(),
    config: {
      dmg: {
        icon: null,
      },
      mac: {
        bundleVersion: "50"
      },
    },
    effectiveOptionComputed: async it => {
      expect(it.specification.icon).toBeNull()
      expect(it.packager.appInfo.buildVersion).toEqual("50")
      expect(await it.packager.getIconPath()).not.toBeNull()
      return true
    },
  })
})