import test from "./helpers/avaEx"
import { assertPack, modifyPackageJson, outDirName } from "./helpers/packTester"
import { move, outputFile, outputJson } from "fs-extra-p"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { Platform, PackagerOptions } from "out"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test("custom buildResources dir", () => assertPack("test-app-one", allPlatformsAndCurrentArch(), {
  tempDirCreated: projectDir => BluebirdPromise.all([
    modifyPackageJson(projectDir, data => {
      data.directories = {
        buildResources: "custom"
      }
    }),
    move(path.join(projectDir, "build"), path.join(projectDir, "custom"))
  ])
}))

test("custom output dir", () => assertPack("test-app-one", allPlatformsAndCurrentArch(false), {
  tempDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.directories = {
      output: "customDist"
    }
  }),
  packed: async (projectDir) => {
    await assertThat(path.join(projectDir, "customDist")).isDirectory()
  }
}))

test("productName with space", () => assertPack("test-app-one", allPlatformsAndCurrentArch(), {
  tempDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.productName = "Test App"
  })
}))

test("build in the app package.json", t => t.throws(assertPack("test-app", allPlatformsAndCurrentArch(), {
  tempDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.build = {
      "iconUrl": "bar",
    }
  }, true)
}), /'build' in the application package\.json .+/))

test("invalid main in the app package.json", t => t.throws(assertPack("test-app", allPlatformsAndCurrentArch(false), {
  tempDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.main = "main.js"
  }, true)
}), "Application entry file main.js could not be found in package. Seems like a wrong configuration."))

test("invalid main in the app package.json (no asar)", t => t.throws(assertPack("test-app", allPlatformsAndCurrentArch(false), {
  tempDirCreated: projectDir => {
    return BluebirdPromise.all([
      modifyPackageJson(projectDir, data => {
        data.main = "main.js"
      }, true),
      modifyPackageJson(projectDir, data => {
        data.build.asar = false
      })
    ])
  }
}), "Application entry file main.js could not be found in package. Seems like a wrong configuration."))

test("main in the app package.json (no asar)", () => assertPack("test-app", allPlatformsAndCurrentArch(false), {
  tempDirCreated: projectDir => {
    return BluebirdPromise.all([
      move(path.join(projectDir, "app", "index.js"), path.join(projectDir, "app", "main.js")),
      modifyPackageJson(projectDir, data => {
        data.main = "main.js"
      }, true),
      modifyPackageJson(projectDir, data => {
        data.build.asar = false
      })
    ])
  }
}))

test("relative index", () => assertPack("test-app", allPlatformsAndCurrentArch(false), {
  tempDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.main = "./index.js"
  }, true)
}))

test("version from electron-prebuilt dependency", () => assertPack("test-app-one", {
  platform: [Platform.fromString(process.platform)],
  dist: false
}, {
  tempDirCreated: projectDir => BluebirdPromise.all([
    outputJson(path.join(projectDir, "node_modules", "electron-prebuilt", "package.json"), {
      version: "0.37.8"
    }),
    modifyPackageJson(projectDir, data => {
      data.devDependencies = {}
    })
  ])
}))

test("www as default dir", () => assertPack("test-app", {
  platform: [Platform.fromString(process.platform)],
}, {
  tempDirCreated: projectDir => move(path.join(projectDir, "app"), path.join(projectDir, "www"))
}))

test("copy extra resource", async () => {
  for (let platform of getPossiblePlatforms()) {
    const osName = platform.buildConfigurationKey

    //noinspection SpellCheckingInspection
    await assertPack("test-app", {
      platform: [platform],
      // to check NuGet package
      dist: platform === Platform.WINDOWS
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
      packed: async (projectDir) => {
        let resourcesDir = path.join(projectDir, outDirName, "TestApp-" + platform.nodeName + "-" + process.arch)
        if (platform === Platform.OSX) {
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
      expectedContents: platform === Platform.WINDOWS ? [
        "lib/net45/content_resources_200_percent.pak",
        "lib/net45/content_shell.pak",
        "lib/net45/d3dcompiler_47.dll",
        "lib/net45/ffmpeg.dll",
        "lib/net45/icudtl.dat",
        "lib/net45/libEGL.dll",
        "lib/net45/libGLESv2.dll",
        "lib/net45/LICENSE",
        "lib/net45/LICENSES.chromium.html",
        "lib/net45/msvcp120.dll",
        "lib/net45/msvcr120.dll",
        "lib/net45/natives_blob.bin",
        "lib/net45/node.dll",
        "lib/net45/platformSpecific",
        "lib/net45/snapshot_blob.bin",
        "lib/net45/TestApp.exe",
        "lib/net45/ui_resources_200_percent.pak",
        "lib/net45/Update.exe",
        "lib/net45/vccorlib120.dll",
        "lib/net45/version",
        "lib/net45/xinput1_3.dll",
        "lib/net45/bar/hello.txt",
        "lib/net45/bar/x64.txt",
        "lib/net45/foo/nameWithoutDot",
        "lib/net45/locales/en-US.pak",
        "lib/net45/resources/app.asar",
        "lib/net45/resources/electron.asar",
        "lib/net45/win/x64.txt",
        "TestApp.nuspec",
        "[Content_Types].xml",
        "_rels/.rels"
      ] : null,
    })
  }
})

test("invalid platform", (t) => t.throws(assertPack("test-app-one", {
  platform: [null],
  dist: false
}), "Unknown platform: null"))

function allPlatformsAndCurrentArch(dist: boolean = true): PackagerOptions {
  return {
    platform: getPossiblePlatforms(),
    dist: dist,
    // speed up tests
    cscLink: null,
    cscInstallerLink: null,
  }
}

function getPossiblePlatforms(): Array<Platform> {
  const isCi = process.env.CI != null
  if (process.platform === Platform.OSX.nodeName) {
    return isCi ? [Platform.OSX, Platform.LINUX] : [Platform.OSX, Platform.LINUX, Platform.WINDOWS]
  }
  else if (process.platform === Platform.LINUX.nodeName) {
    // todo install wine on Linux agent
    return [Platform.LINUX]
  }
  else {
    return [Platform.WINDOWS]
  }
}