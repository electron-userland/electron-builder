import { exec } from "builder-util"
import { copyFile } from "builder-util/out/fs"
import { attachAndExecute, getDmgTemplatePath } from "dmg-builder/out/dmgUtil"
import { Platform } from "electron-builder"
import { PlatformPackager } from "app-builder-lib"
import * as path from "path"
import * as fs from "fs/promises"
import { assertThat } from "../helpers/fileAssert"
import { app, assertPack, copyTestAsset } from "../helpers/packTester"

const dmgTarget = Platform.MAC.createTarget("dmg")

test.ifMac(
  "dmg",
  app({
    targets: dmgTarget,
    config: {
      productName: "DefaultDmg",
      publish: null,
    },
  })
)

test.ifMac(
  "no build directory",
  app(
    {
      targets: dmgTarget,
      config: {
        // dmg can mount only one volume name, so, to test in parallel, we set different product name
        productName: "NoBuildDirectory",
        publish: null,
      },
      effectiveOptionComputed: async it => {
        if (!("volumePath" in it)) {
          return false
        }

        const volumePath = it.volumePath
        await assertThat(path.join(volumePath, ".background", "background.tiff")).isFile()
        await assertThat(path.join(volumePath, "Applications")).isSymbolicLink()
        expect(it.specification.contents).toMatchSnapshot()
        return false
      },
    },
    {
      projectDirCreated: projectDir => fs.rm(path.join(projectDir, "build"), { recursive: true, force: true }),
    }
  )
)

test.ifMac(
  "background color",
  app({
    targets: dmgTarget,
    config: {
      // dmg can mount only one volume name, so, to test in parallel, we set different product name
      productName: "BackgroundColor",
      publish: null,
      dmg: {
        backgroundColor: "orange",
        // speed-up test
        writeUpdateInfo: false,
      },
    },
    effectiveOptionComputed: async it => {
      if (!("volumePath" in it)) {
        return false
      }
      delete it.specification.icon
      expect(it.specification).toMatchSnapshot()
      return false
    },
  })
)

test.ifMac("custom background - new way", () => {
  const customBackground = "customBackground.png"
  return assertPack(
    "test-app-one",
    {
      targets: Platform.MAC.createTarget(),
      config: {
        publish: null,
        mac: {
          icon: "customIcon",
        },
        dmg: {
          background: customBackground,
          icon: "foo.icns",
          // speed-up test
          writeUpdateInfo: false,
        },
      },
      effectiveOptionComputed: async it => {
        expect(it.specification.background).toMatch(new RegExp(`.+${customBackground}$`))
        expect(it.specification.icon).toEqual("foo.icns")
        const packager: PlatformPackager<any> = it.packager
        expect(await packager.getIconPath()).toEqual(path.join(packager.projectDir, "build", "customIcon.icns"))
        return true
      },
    },
    {
      projectDirCreated: projectDir =>
        Promise.all([
          copyFile(path.join(getDmgTemplatePath(), "background.tiff"), path.join(projectDir, customBackground)),
          // copy, but not rename to test that default icon is not used
          copyFile(path.join(projectDir, "build", "icon.icns"), path.join(projectDir, "build", "customIcon.icns")),
          copyFile(path.join(projectDir, "build", "icon.icns"), path.join(projectDir, "foo.icns")),
        ]),
    }
  )
})

test.ifAll.ifMac("retina background as 2 png", () => {
  return assertPack(
    "test-app-one",
    {
      targets: Platform.MAC.createTarget(),
      config: {
        publish: null,
      },
      effectiveOptionComputed: async it => {
        expect(it.specification.background).toMatch(/\.tiff$/)
        return true
      },
    },
    {
      projectDirCreated: async projectDir => {
        const resourceDir = path.join(projectDir, "build")
        await copyFile(path.join(getDmgTemplatePath(), "background.tiff"), path.join(resourceDir, "background.tiff"))

        async function extractPng(index: number, suffix: string) {
          await exec("tiffutil", ["-extract", index.toString(), path.join(getDmgTemplatePath(), "background.tiff")], {
            cwd: projectDir,
          })
          await exec("sips", ["-s", "format", "png", "out.tiff", "--out", `background${suffix}.png`], {
            cwd: projectDir,
          })
        }

        await extractPng(0, "")
        await extractPng(1, "@2x")
        await fs.unlink(path.join(resourceDir, "background.tiff"))
      },
    }
  )
})

test.ifMac.ifAll("no Applications link", () => {
  return assertPack("test-app-one", {
    targets: Platform.MAC.createTarget(),
    config: {
      publish: null,
      productName: "NoApplicationsLink",
      dmg: {
        contents: [
          {
            x: 110,
            y: 150,
          },
          {
            x: 410,
            y: 440,
            type: "link",
            path: "/Applications/TextEdit.app",
          },
        ],
      },
    },
    effectiveOptionComputed: async it => {
      if (!("volumePath" in it)) {
        return false
      }

      const volumePath = it.volumePath
      await Promise.all([
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

test.ifMac(
  "unset dmg icon",
  app(
    {
      targets: dmgTarget,
      config: {
        publish: null,
        // dmg can mount only one volume name, so, to test in parallel, we set different product name
        productName: "Test ß No Volume Icon",
        dmg: {
          icon: null,
        },
      },
    },
    {
      packed: context => {
        return attachAndExecute(path.join(context.outDir, "Test ß No Volume Icon-1.1.0.dmg"), false, () => {
          return Promise.all([
            assertThat(path.join("/Volumes/Test ß No Volume Icon 1.1.0/.background/background.tiff")).isFile(),
            assertThat(path.join("/Volumes/Test ß No Volume Icon 1.1.0/.VolumeIcon.icns")).doesNotExist(),
          ])
        })
      },
    }
  )
)

// test also "only dmg"
test.ifMac(
  "no background",
  app(
    {
      targets: dmgTarget,
      config: {
        publish: null,
        // dmg can mount only one volume name, so, to test in parallel, we set different product name
        productName: "NoBackground",
        dmg: {
          background: null,
          title: "Foo",
        },
      },
    },
    {
      packed: context => {
        return attachAndExecute(path.join(context.outDir, "NoBackground-1.1.0.dmg"), false, () => {
          return assertThat(path.join("/Volumes/NoBackground 1.1.0/.background")).doesNotExist()
        })
      },
    }
  )
)

// test also darkModeSupport
test.ifAll.ifMac(
  "bundleShortVersion",
  app({
    targets: dmgTarget,
    config: {
      publish: null,
      // dmg can mount only one volume name, so, to test in parallel, we set different product name
      productName: "BundleShortVersion",
      mac: {
        bundleShortVersion: "2017.1-alpha5",
        darkModeSupport: true,
      },
    },
  })
)

test.ifAll.ifMac("disable dmg icon (light), bundleVersion", () => {
  return assertPack("test-app-one", {
    targets: Platform.MAC.createTarget(),
    config: {
      publish: null,
      dmg: {
        icon: null,
      },
      mac: {
        bundleVersion: "50",
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

const packagerOptions = {
  targets: dmgTarget,
  config: {
    publish: null,
  },
}

test.ifAll.ifMac(
  "multi language license",
  app(packagerOptions, {
    projectDirCreated: projectDir => {
      return Promise.all([
        // writeFile(path.join(projectDir, "build", "license_en.txt"), "Hi"),
        fs.writeFile(path.join(projectDir, "build", "license_de.txt"), "Hallo"),
        fs.writeFile(path.join(projectDir, "build", "license_ja.txt"), "こんにちは"),
      ])
    },
  })
)

test.ifAll.ifMac(
  "license ja",
  app(packagerOptions, {
    projectDirCreated: projectDir => {
      return fs.writeFile(path.join(projectDir, "build", "license_ja.txt"), "こんにちは".repeat(12))
    },
  })
)

test.ifAll.ifMac(
  "license en",
  app(packagerOptions, {
    projectDirCreated: projectDir => {
      return copyTestAsset("license_en.txt", path.join(projectDir, "build", "license_en.txt"))
    },
  })
)

test.ifAll.ifMac(
  "license rtf",
  app(packagerOptions, {
    projectDirCreated: projectDir => {
      return copyTestAsset("license_de.rtf", path.join(projectDir, "build", "license_de.rtf"))
    },
  })
)

test.ifAll.ifMac(
  "license buttons config",
  app(
    {
      ...packagerOptions,
      effectiveOptionComputed: async it => {
        if ("licenseData" in it) {
          // Clean `file` path from the data because the path is dynamic at runtime
          it.licenseData.body.forEach((license: any) => {
            delete license.file
          })
          expect(it.licenseData).toMatchSnapshot()
        }
        return false
      },
    },
    {
      projectDirCreated: projectDir =>
        Promise.all([
          copyTestAsset("license_en.txt", path.join(projectDir, "build", "license_en.txt")),
          copyTestAsset("license_fr.txt", path.join(projectDir, "build", "license_fr.txt")),
          copyTestAsset("license_ja.txt", path.join(projectDir, "build", "license_ja.txt")),
          copyTestAsset("license_ko.txt", path.join(projectDir, "build", "license_ko.txt")),
          copyTestAsset("licenseButtons_en.yml", path.join(projectDir, "build", "licenseButtons_en.yml")),
          copyTestAsset("licenseButtons_fr.json", path.join(projectDir, "build", "licenseButtons_fr.json")),
          copyTestAsset("licenseButtons_ja.json", path.join(projectDir, "build", "licenseButtons_ja.json")),
          copyTestAsset("licenseButtons_ko.json", path.join(projectDir, "build", "licenseButtons_ko.json")),
        ]),
    }
  )
)
