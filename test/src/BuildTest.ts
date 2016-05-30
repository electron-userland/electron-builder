import test from "./helpers/avaEx"
import { assertPack, modifyPackageJson, outDirName } from "./helpers/packTester"
import { expectedWinContents } from "./helpers/expectedContents"
import { move, outputFile, outputJson } from "fs-extra-p"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { Platform, PackagerOptions, DIR_TARGET } from "out"
import pathSorter = require("path-sort")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test("custom buildResources dir", () => assertPack("test-app-one", allPlatforms(), {
  tempDirCreated: projectDir => BluebirdPromise.all([
    modifyPackageJson(projectDir, data => {
      data.directories = {
        buildResources: "custom"
      }
    }),
    move(path.join(projectDir, "build"), path.join(projectDir, "custom"))
  ])
}))

test("custom output dir", () => assertPack("test-app-one", allPlatforms(false), {
  tempDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.directories = {
      output: "customDist"
    }
  }),
  packed: async (projectDir) => {
    await assertThat(path.join(projectDir, "customDist")).isDirectory()
  }
}))

test("productName with space", () => assertPack("test-app-one", allPlatforms(), {
  tempDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.productName = "Test App Cool"
  })
}))

test("build in the app package.json", t => t.throws(assertPack("test-app", allPlatforms(), {
  tempDirCreated: it => modifyPackageJson(it, data => {
    data.build = {
      "iconUrl": "bar",
    }
  }, true)
}), /'build' in the application package\.json .+/))

test("name in the build", t => t.throws(assertPack("test-app-one", currentPlatform(), {
  tempDirCreated: it => modifyPackageJson(it, data => {
    data.build = {
      "name": "Cool App",
    }
  })
}), /'name' in the 'build' is forbidden/))

test("empty description", t => t.throws(assertPack("test-app-one", {
  platform: [Platform.LINUX],
  devMetadata: <any>{
    description: "",
  }
}), /Please specify 'description'/))

test("invalid main in the app package.json", t => t.throws(assertPack("test-app", allPlatforms(false), {
  tempDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.main = "main.js"
  }, true)
}), "Application entry file main.js could not be found in package. Seems like a wrong configuration."))

test("invalid main in the app package.json (no asar)", t => t.throws(assertPack("test-app", allPlatforms(false), {
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

test("main in the app package.json (no asar)", () => assertPack("test-app", allPlatforms(false), {
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

test("relative index", () => assertPack("test-app", allPlatforms(false), {
  tempDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.main = "./index.js"
  }, true)
}))

const electronVersion = "0.37.8"

test.ifNotWindows("electron version from electron-prebuilt dependency", () => assertPack("test-app-one", {
  platform: [Platform.LINUX],
  target: ["dir"],
}, {
  tempDirCreated: projectDir => BluebirdPromise.all([
    outputJson(path.join(projectDir, "node_modules", "electron-prebuilt", "package.json"), {
      version: electronVersion
    }),
    modifyPackageJson(projectDir, data => {
      data.devDependencies = {}
    })
  ])
}))

test.ifNotWindows("electron version from build", () => assertPack("test-app-one", {
  platform: [Platform.LINUX],
  target: [DIR_TARGET],
}, {
  tempDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.devDependencies = {}
    data.build.electronVersion = electronVersion
  })
}))

test("www as default dir", () => assertPack("test-app", currentPlatform(), {
  tempDirCreated: projectDir => move(path.join(projectDir, "app"), path.join(projectDir, "www"))
}))

test("afterPack", t => {
  const possiblePlatforms = process.env.CI ? [Platform.fromString(process.platform)] : getPossiblePlatforms()
  let called = 0
  return assertPack("test-app-one", {
    // linux pack is very fast, so, we use it :)
    platform: possiblePlatforms,
    target: [DIR_TARGET],
    devMetadata: {
      build: {
        afterPack: () => {
          called++
          return Promise.resolve()
        }
      }
    }
  }, {
    packed: () => {
      t.is(called, possiblePlatforms.length)
      return Promise.resolve()
    }
  })
})

test("copy extra content", async () => {
  for (let platform of getPossiblePlatforms()) {
    const osName = platform.buildConfigurationKey

    const winDirPrefix = "lib/net45/resources/"

    //noinspection SpellCheckingInspection
    await assertPack("test-app", {
      platform: [platform],
      // to check NuGet package
      target: platform === Platform.WINDOWS ? null : [DIR_TARGET],
    }, {
      tempDirCreated: (projectDir) => {
        return BluebirdPromise.all([
          modifyPackageJson(projectDir, data => {
            data.build.extraResources = [
              "foo",
              "bar/hello.txt",
              "bar/${arch}.txt",
              "${os}/${arch}.txt",
            ]

            data.build[osName] = {
              extraResources: [
                "platformSpecificR"
              ],
              extraFiles: [
                "platformSpecificF"
              ],
            }
          }),
          outputFile(path.join(projectDir, "foo/nameWithoutDot"), "nameWithoutDot"),
          outputFile(path.join(projectDir, "bar/hello.txt"), "data"),
          outputFile(path.join(projectDir, `bar/${process.arch}.txt`), "data"),
          outputFile(path.join(projectDir, `${osName}/${process.arch}.txt`), "data"),
          outputFile(path.join(projectDir, "platformSpecificR"), "platformSpecificR"),
          outputFile(path.join(projectDir, "ignoreMe.txt"), "ignoreMe"),
        ])
      },
      packed: async (projectDir) => {
        const base = path.join(projectDir, outDirName, platform.buildConfigurationKey)
        let resourcesDir = path.join(base, "resources")
        if (platform === Platform.OSX) {
          resourcesDir = path.join(base, "TestApp.app", "Contents", "Resources")
        }
        else if (platform === Platform.WINDOWS) {
          resourcesDir = path.join(base + "-unpacked", "resources")
        }
        await assertThat(path.join(resourcesDir, "foo")).isDirectory()
        await assertThat(path.join(resourcesDir, "foo", "nameWithoutDot")).isFile()
        await assertThat(path.join(resourcesDir, "bar", "hello.txt")).isFile()
        await assertThat(path.join(resourcesDir, "bar", `${process.arch}.txt`)).isFile()
        await assertThat(path.join(resourcesDir, osName, `${process.arch}.txt`)).isFile()
        await assertThat(path.join(resourcesDir, "platformSpecificR")).isFile()
        await assertThat(path.join(resourcesDir, "ignoreMe.txt")).doesNotExist()
      },
      expectedContents: platform === Platform.WINDOWS ? pathSorter(expectedWinContents.concat(
        winDirPrefix + "bar/hello.txt",
        winDirPrefix + "bar/x64.txt",
        winDirPrefix + "foo/nameWithoutDot",
        winDirPrefix + "platformSpecificR",
        winDirPrefix + "win/x64.txt"
      )) : null,
    })
  }
})

test("invalid platform", t => t.throws(assertPack("test-app-one", {
  platform: [null],
  target: [DIR_TARGET]
}), "Unknown platform: null"))

function allPlatforms(dist: boolean = true): PackagerOptions {
  return {
    platform: getPossiblePlatforms(),
    target: dist ? null : [DIR_TARGET],
  }
}

function currentPlatform(dist: boolean = true): PackagerOptions {
  return {
    platform: [Platform.fromString(process.platform)],
    target: dist ? null : [DIR_TARGET],
  }
}

function getPossiblePlatforms(): Array<Platform> {
  if (process.platform === Platform.OSX.nodeName) {
    return process.env.CI ? [Platform.OSX, Platform.LINUX] : [Platform.OSX, Platform.LINUX, Platform.WINDOWS]
  }
  else if (process.platform === Platform.LINUX.nodeName) {
    return [Platform.LINUX, Platform.WINDOWS]
  }
  else {
    return [Platform.WINDOWS]
  }
}