import test from "./helpers/avaEx"
import { assertPack, modifyPackageJson, platform } from "./helpers/packTester"
import { move, outputFile, outputJson } from "fs-extra-p"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { Platform, PackagerOptions } from "out"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

if (process.env.TRAVIS !== "true") {
  // we don't use CircleCI, so, we can safely set this env
  process.env.CIRCLE_BUILD_NUM = 42
}

test.ifOsx("mac: two-package.json", async () => {
  await assertPack("test-app", platform("darwin"))
})

test.ifOsx("mac: one-package.json", async () => {
  await assertPack("test-app-one", platform("darwin"))
})

test("custom app dir", async () => {
  await assertPack("test-app-one", allPlatformsAndCurrentArch(), {
    tempDirCreated: (projectDir) => {
      return BluebirdPromise.all([
        modifyPackageJson(projectDir, data => {
          data.directories = {
            buildResources: "custom"
          }
        }),
        move(path.join(projectDir, "build"), path.join(projectDir, "custom"))
      ])
    }
  })
})

test("productName with space", async () => {
  await assertPack("test-app-one", allPlatformsAndCurrentArch(), {
    tempDirCreated: projectDir => {
      return modifyPackageJson(projectDir, data => {
        data.productName = "Test App"
      })
    }
  })
})

test("build in the app package.json", t => {
  t.throws(assertPack("test-app", allPlatformsAndCurrentArch(), {
    tempDirCreated: projectDir => {
      return modifyPackageJson(projectDir, data => {
        data.build = {
          "iconUrl": "bar",
        }
      }, true)
    }
  }), /'build' in the application package\.json .+/)
})

test("version from electron-prebuilt dependency", async() => {
  await assertPack("test-app-one", {
    platform: [process.platform],
    arch: process.arch,
    dist: false
  }, {
    tempDirCreated: projectDir => {
      return BluebirdPromise.all([
        outputJson(path.join(projectDir, "node_modules", "electron-prebuilt", "package.json"), {
          version: "0.37.2"
        }),
        modifyPackageJson(projectDir, data => {
          data.devDependencies = {}
        })
      ])
    }
  })
})

test("copy extra resource", async () => {
  for (let platform of getPossiblePlatforms()) {
    const osName = Platform.fromNodePlatform(platform).buildConfigurationKey

    await assertPack("test-app", {
      platform: [platform],
      arch: process.arch,
      // to check NuGet package
      dist: platform === "win32"
    }, {
      tempDirCreated: (projectDir) => {
        return BluebirdPromise.all([
          modifyPackageJson(projectDir, data => {
            if (data.build == null) {
              data.build = {}
            }
            data.build.extraResources = [
              "foo",
              "bar/hello.txt",
              "bar/${arch}.txt",
              "${os}/${arch}.txt",
            ]

            data.build[osName] = {
              extraResources: [
                "platformSpecific"
              ]
            }
          }),
          outputFile(path.join(projectDir, "foo/nameWithoutDot"), "nameWithoutDot"),
          outputFile(path.join(projectDir, "bar/hello.txt"), "data"),
          outputFile(path.join(projectDir, `bar/${process.arch}.txt`), "data"),
          outputFile(path.join(projectDir, `${osName}/${process.arch}.txt`), "data"),
          outputFile(path.join(projectDir, "platformSpecific"), "platformSpecific"),
          outputFile(path.join(projectDir, "ignoreMe.txt"), "ignoreMe"),
        ])
      },
      packed: async(projectDir) => {
        let resourcesDir = path.join(projectDir, "dist", "TestApp-" + platform + "-" + process.arch)
        if (platform === "darwin") {
          resourcesDir = path.join(resourcesDir, "TestApp.app", "Contents", "Resources")
        }
        await assertThat(path.join(resourcesDir, "foo")).isDirectory()
        await assertThat(path.join(resourcesDir, "foo", "nameWithoutDot")).isFile()
        await assertThat(path.join(resourcesDir, "bar", "hello.txt")).isFile()
        await assertThat(path.join(resourcesDir, "bar", `${process.arch}.txt`)).isFile()
        await assertThat(path.join(resourcesDir, osName, `${process.arch}.txt`)).isFile()
        await assertThat(path.join(resourcesDir, "platformSpecific")).isFile()
        await assertThat(path.join(resourcesDir, "ignoreMe.txt")).doesNotExist()
      },
      expectedContents: platform === "win32" ? [
        "lib/net45/content_resources_200_percent.pak",
        "lib/net45/content_shell.pak",
        "lib/net45/d3dcompiler_47.dll",
        "lib/net45/ffmpeg.dll",
        "lib/net45/icudtl.dat",
        "lib/net45/libEGL.dll",
        "lib/net45/libGLESv2.dll",
        "lib/net45/LICENSE",
        "lib/net45/msvcp120.dll",
        "lib/net45/msvcr120.dll",
        "lib/net45/natives_blob.bin",
        "lib/net45/node.dll",
        "lib/net45/platformSpecific",
        "lib/net45/snapshot_blob.bin",
        "lib/net45/squirrel.exe",
        "lib/net45/TestApp.exe",
        "lib/net45/ui_resources_200_percent.pak",
        "lib/net45/vccorlib120.dll",
        "lib/net45/xinput1_3.dll",
        "lib/net45/bar/hello.txt",
        "lib/net45/bar/x64.txt",
        "lib/net45/foo/nameWithoutDot",
        "lib/net45/locales/en-US.pak",
        "lib/net45/resources/app.asar",
        "lib/net45/resources/atom.asar",
        "lib/net45/win/x64.txt",
        "TestApp.nuspec",
        "[Content_Types].xml",
        "_rels/.rels"
      ] : null,
    })
  }
})

function allPlatformsAndCurrentArch(): PackagerOptions {
  return {
    platform: getPossiblePlatforms(),
    // speed up tests, we don't need check every arch
    arch: process.arch,
  }
}

function getPossiblePlatforms(): Array<string> {
  const isCi = process.env.CI != null
  if (process.platform === "darwin") {
    return isCi ? ["darwin", "linux"] : ["darwin", "linux", "win32"]
  }
  else if (process.platform === "linux") {
    // todo install wine on Linux agent
    return ["linux"]
  }
  else {
    return ["win32"]
  }
}