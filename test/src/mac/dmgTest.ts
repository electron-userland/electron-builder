import { PlatformPackager } from "app-builder-lib"
import { Arch, copyFile, exec } from "builder-util"
import { Platform } from "electron-builder"
import * as fs from "fs/promises"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { app, assertPack, copyTestAsset } from "../helpers/packTester"
import { attachAndExecute, getDmgTemplatePath } from "dmg-builder"

const dmgTarget = Platform.MAC.createTarget("dmg", Arch.x64)
const defaultTarget = Platform.MAC.createTarget(undefined, Arch.x64)

describe("dmg", { concurrent: true }, () => {
  test("dmg", ({ expect }) =>
    app(expect, {
      targets: dmgTarget,
      config: {
        productName: "Default-Dmg",
        publish: null,
      },
    }))

  test.ifMac("no build directory", ({ expect }) =>
    app(
      expect,
      {
        targets: dmgTarget,
        config: {
          // dmg can mount only one volume name, so, to test in parallel, we set different product name
          productName: "NoBuildDirectory",
          publish: null,
          dmg: {
            title: "Foo",
          },
        },
        effectiveOptionComputed: async it => {
          if (!("volumePath" in it)) {
            return false
          }

          const volumePath = it.volumePath
          await assertThat(expect, path.join(volumePath, ".background.tiff")).isFile()
          await assertThat(expect, path.join(volumePath, "Applications")).isSymbolicLink()
          expect(
            it.specification.contents.map((c: any) => ({
              ...c,
              path: path.extname(c.path) === ".app" ? path.basename(c.path) : c.path,
            }))
          ).toMatchSnapshot()
          return false
        },
      },
      {
        projectDirCreated: projectDir => fs.rm(path.join(projectDir, "build"), { recursive: true, force: true }),
      }
    )
  )

  test.ifMac("background color", ({ expect }) =>
    app(expect, {
      targets: dmgTarget,
      config: {
        // dmg can mount only one volume name, so, to test in parallel, we set different product name
        productName: "BackgroundColor",
        publish: null,
        dmg: {
          backgroundColor: "orange",
          // speed-up test
          writeUpdateInfo: false,
          title: "Bar",
        },
      },
      effectiveOptionComputed: async it => {
        if (!("volumePath" in it)) {
          return false
        }
        delete it.specification.icon
        expect(it.specification).toMatchSnapshot()
        return Promise.resolve(false)
      },
    })
  )

  test.ifMac("custom background - new way", ({ expect }) => {
    const customBackground = "customBackground.png"
    return assertPack(
      expect,
      "test-app-one",
      {
        targets: defaultTarget,
        config: {
          productName: "CustomBackground",
          publish: null,
          mac: {
            icon: "customIcon",
          },
          dmg: {
            background: customBackground,
            icon: "foo.icns",
            // speed-up test
            writeUpdateInfo: false,
            title: "Custom Background",
          },
        },
        effectiveOptionComputed: async it => {
          expect(it.specification.background).toMatch(new RegExp(`.+${customBackground}$`))
          expect(it.specification.icon).toEqual("foo.icns")
          const packager: PlatformPackager<any> = it.packager
          expect(await packager.getIconPath()).toEqual(path.join(packager.projectDir, "build", "customIcon.icns"))

          if (!("volumePath" in it)) {
            return false
          }
          await assertThat(expect, path.join(it.volumePath, ".VolumeIcon.icns")).isFile()
          return Promise.resolve(true)
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

  test.ifMac("retina background as 2 png", ({ expect }) => {
    return assertPack(
      expect,
      "test-app-one",
      {
        targets: defaultTarget,
        config: {
          productName: "RetinaBackground",
          publish: null,
          dmg: {
            title: "Retina Background",
            badgeIcon: "foo.icns",
          },
        },
        effectiveOptionComputed: async it => {
          expect(it.specification.background).toMatch(/\.tiff$/)
          return Promise.resolve(true)
        },
      },
      {
        projectDirCreated: async projectDir => {
          const resourceDir = path.join(projectDir, "build")
          await copyFile(path.join(getDmgTemplatePath(), "background.tiff"), path.join(resourceDir, "background.tiff"))
          await copyFile(path.join(projectDir, "build", "icon.icns"), path.join(projectDir, "foo.icns"))

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

  test.ifMac.skip("no Applications link", ({ expect }) => {
    return assertPack(expect, "test-app-one", {
      targets: defaultTarget,
      config: {
        publish: null,
        productName: "No-ApplicationsLink",
        dmg: {
          title: "No Applications Link",
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
          assertThat(expect, path.join(volumePath, ".background.tiff")).isFile(),
          assertThat(expect, path.join(volumePath, "Applications")).doesNotExist(),
          assertThat(expect, path.join(volumePath, "TextEdit.app")).isSymbolicLink(),
          assertThat(expect, path.join(volumePath, "TextEdit.app")).isDirectory(),
        ])
        expect(it.specification.contents).toMatchSnapshot()
        return false
      },
    })
  })

  test.ifMac("unset dmg icon", ({ expect }) =>
    app(
      expect,
      {
        targets: dmgTarget,
        config: {
          publish: null,
          // dmg can mount only one volume name, so, to test in parallel, we set different product name
          productName: "No_Volume_Icon",
          dmg: {
            icon: null,
          },
        },
      },
      {
        packed: context => {
          return attachAndExecute(path.join(context.outDir, "No_Volume_Icon-1.1.0.dmg"), false, true, () => {
            return Promise.all([
              assertThat(expect, path.join("/Volumes/No_Volume_Icon 1.1.0/.background.tiff")).isFile(),
              assertThat(expect, path.join("/Volumes/No_Volume_Icon 1.1.0/.VolumeIcon.icns")).doesNotExist(),
            ])
          })
        },
      }
    )
  )

  // test also "only dmg"
  test.ifMac("no background", ({ expect }) =>
    app(
      expect,
      {
        targets: dmgTarget,
        config: {
          publish: null,
          // dmg can mount only one volume name, so, to test in parallel, we set different product name
          productName: "No-Background",
          dmg: {
            background: null,
            title: "Foo",
          },
        },
      },
      {
        packed: context => {
          return attachAndExecute(path.join(context.outDir, "No-Background-1.1.0.dmg"), false, true, () => {
            return assertThat(expect, path.join("/Volumes/No-Background 1.1.0/.background.tiff")).doesNotExist()
          })
        },
      }
    )
  )

  // test also darkModeSupport
  test.ifMac("bundleShortVersion", ({ expect }) =>
    app(expect, {
      targets: dmgTarget,
      config: {
        publish: null,
        // dmg can mount only one volume name, so, to test in parallel, we set different product name
        productName: "Bundle-ShortVersion",
        mac: {
          bundleShortVersion: "2017.1-alpha5",
          darkModeSupport: true,
        },
        dmg: {
          title: "bundleShortVersion",
        },
      },
    })
  )

  test.ifMac("disable dmg icon (light), bundleVersion", ({ expect }) => {
    return assertPack(expect, "test-app-one", {
      targets: defaultTarget,
      config: {
        publish: null,
        productName: "Disable-Icon",
        dmg: {
          icon: null,
          title: "Disable Icon",
        },
        mac: {
          bundleVersion: "50",
        },
      },
      effectiveOptionComputed: async it => {
        expect(it.specification.icon).toBeNull()
        expect(it.packager.appInfo.buildVersion).toEqual("50")
        expect(await it.packager.getIconPath()).not.toBeNull()
        return Promise.resolve(true)
      },
    })
  })

  const packagerOptions = (uniqueKey: number) => ({
    targets: dmgTarget,
    config: {
      publish: null,
      productName: "Foo-" + uniqueKey,
      dmg: {
        title: "Foo " + uniqueKey,
      },
    },
  })

  test.ifMac("multi language license", ({ expect }) =>
    app(expect, packagerOptions(1), {
      projectDirCreated: projectDir => {
        return Promise.all([
          // writeFile(path.join(projectDir, "build", "license_en.txt"), "Hi"),
          fs.writeFile(path.join(projectDir, "build", "license_de.txt"), "Hallo"),
          fs.writeFile(path.join(projectDir, "build", "license_ja.txt"), "こんにちは"),
        ])
      },
    })
  )

  test.ifMac("license ja", ({ expect }) =>
    app(expect, packagerOptions(2), {
      projectDirCreated: projectDir => {
        return fs.writeFile(path.join(projectDir, "build", "license_ja.txt"), "こんにちは".repeat(12))
      },
    })
  )

  test.ifMac("license en", ({ expect }) =>
    app(expect, packagerOptions(3), {
      projectDirCreated: projectDir => {
        return copyTestAsset("license_en.txt", path.join(projectDir, "build", "license_en.txt"))
      },
    })
  )

  test.ifMac("license rtf", ({ expect }) =>
    app(expect, packagerOptions(4), {
      projectDirCreated: projectDir => {
        return copyTestAsset("license_de.rtf", path.join(projectDir, "build", "license_de.rtf"))
      },
    })
  )

  test.ifMac("license buttons config", ({ expect }) =>
    app(
      expect,
      {
        ...packagerOptions(5),
        effectiveOptionComputed: async it => {
          if ("licenseData" in it) {
            // Clean `file` path from the data because the path is dynamic at runtime
            it.licenseData.body.forEach((license: any) => {
              delete license.file
            })
            expect(it.licenseData).toMatchSnapshot()
          }
          return Promise.resolve(false)
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
})
