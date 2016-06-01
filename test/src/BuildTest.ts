import test from "./helpers/avaEx"
import { assertPack, modifyPackageJson, outDirName } from "./helpers/packTester"
import { expectedWinContents } from "./helpers/expectedContents"
import { move, outputFile, outputJson } from "fs-extra-p"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { archFromString, BuildOptions, Platform, Arch, PackagerOptions, DIR_TARGET, createTargets } from "out"
import pathSorter = require("path-sort")
import { normalizeOptions } from "out/builder"
import { createYargs } from "out/cliOptions"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/awaiter")

test("cli", (t) => {
  const yargs = createYargs()

  const base = {
    publish: <string>undefined,
  }

  function expected(opt: PackagerOptions): any {
    return Object.assign(base, opt)
  }

  function parse(input: string): BuildOptions {
    return normalizeOptions(yargs.parse(input.split(" ")))
  }

  t.deepEqual(parse("--osx"), expected({targets: Platform.OSX.createTarget()}))
  t.deepEqual(parse("--linux"), expected({targets: Platform.LINUX.createTarget()}))
  t.deepEqual(parse("--win"), expected({targets: Platform.WINDOWS.createTarget()}))
  t.deepEqual(parse("-owl"), expected({targets: createTargets([Platform.OSX, Platform.WINDOWS, Platform.LINUX])}))
  t.deepEqual(parse("-l tar.gz:ia32"), expected({targets: Platform.LINUX.createTarget("tar.gz", Arch.ia32)}))
  t.deepEqual(parse("-l tar.gz:x64"), expected({targets: Platform.LINUX.createTarget("tar.gz", Arch.x64)}))
  t.deepEqual(parse("-l tar.gz"), expected({targets: Platform.LINUX.createTarget("tar.gz", archFromString(process.arch))}))
  t.deepEqual(parse("-w tar.gz:x64"), expected({targets: Platform.WINDOWS.createTarget("tar.gz", Arch.x64)}))
})

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
  targets: Platform.LINUX.createTarget(),
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
  targets: Platform.LINUX.createTarget(DIR_TARGET),
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
  targets: Platform.LINUX.createTarget(DIR_TARGET),
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
  const targets = process.env.CI ? Platform.fromString(process.platform).createTarget(DIR_TARGET) : getPossiblePlatforms()
  let called = 0
  return assertPack("test-app-one", {
    targets: targets,
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
      t.is(called, targets.size)
      return Promise.resolve()
    }
  })
})

test("copy extra content", async () => {
  for (let platform of getPossiblePlatforms().keys()) {
    const osName = platform.buildConfigurationKey

    const winDirPrefix = "lib/net45/resources/"

    //noinspection SpellCheckingInspection
    await assertPack("test-app", {
      // to check NuGet package
      targets: platform.createTarget(platform === Platform.WINDOWS ? null : DIR_TARGET),
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

function allPlatforms(dist: boolean = true): PackagerOptions {
  return {
    targets: getPossiblePlatforms(dist ? null : DIR_TARGET),
  }
}

function currentPlatform(dist: boolean = true): PackagerOptions {
  return {
    targets: Platform.fromString(process.platform).createTarget(dist ? null : DIR_TARGET),
  }
}

function getPossiblePlatforms(type?: string): Map<Platform, Map<Arch, string[]>> {
  if (process.platform === Platform.OSX.nodeName) {
    return createTargets(process.env.CI ? [Platform.OSX, Platform.LINUX] : [Platform.OSX, Platform.LINUX, Platform.WINDOWS], type)
  }
  else if (process.platform === Platform.LINUX.nodeName) {
    return createTargets([Platform.LINUX, Platform.WINDOWS], type)
  }
  else {
    return createTargets([Platform.WINDOWS], type)
  }
}