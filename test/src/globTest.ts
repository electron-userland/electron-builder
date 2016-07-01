import test from "./helpers/avaEx"
import { expectedWinContents } from "./helpers/expectedContents"
import { outputFile } from "fs-extra-p"
import { assertPack, modifyPackageJson, outDirName, getPossiblePlatforms } from "./helpers/packTester"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import {  Platform, DIR_TARGET } from "out"
import pathSorter = require("path-sort")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

test.ifDevOrLinuxCi("ignore build resources", () => {
  return assertPack("test-app-one", {
    targets: Platform.LINUX.createTarget(DIR_TARGET),
    devMetadata: {
      build: {
        asar: false
      }
    }
  }, {
    tempDirCreated: projectDir => {
      return outputFile(path.join(projectDir, "one/build/foo.txt"), "data")
    },
    packed: projectDir => {
      return assertThat(path.join(projectDir, outDirName, "linux", "resources", "app", "one", "build", "foo.txt")).isFile()
    },
  })
})

test.ifDevOrLinuxCi("files", () => {
  return assertPack("test-app-one", {
    targets: Platform.LINUX.createTarget(DIR_TARGET),
    devMetadata: {
      build: {
        asar: false,
        files: ["**/*", "!ignoreMe${/*}"]
      }
    }
  }, {
    tempDirCreated: projectDir => {
      return outputFile(path.join(projectDir, "ignoreMe", "foo"), "data")
    },
    packed: projectDir => {
      return assertThat(path.join(projectDir, outDirName, "linux", "resources", "app", "ignoreMe")).doesNotExist()
    },
  })
})

// skip on MacOS because we want test only / and \
test.ifNotCiOsx("ignore node_modules known dev dep", () => {
  const build: any = {
    asar: false,
    ignore: (file: string) => {
      return file === "/ignoreMe"
    }
  }

  return assertPack("test-app-one", {
    targets: Platform.LINUX.createTarget(DIR_TARGET),
    devMetadata: {
      build: build
    }
  }, {
    tempDirCreated: projectDir => {
      return BluebirdPromise.all([
        modifyPackageJson(projectDir, data => {
          data.devDependencies = Object.assign({
              "electron-osx-sign": "*",
            }, data.devDependencies)
        }),
        outputFile(path.join(projectDir, "node_modules", "electron-osx-sign", "package.json"), "{}"),
        outputFile(path.join(projectDir, "ignoreMe"), ""),
      ])
    },
    packed: projectDir => {
      return BluebirdPromise.all([
        assertThat(path.join(projectDir, outDirName, "linux", "resources", "app", "node_modules", "electron-osx-sign")).doesNotExist(),
        assertThat(path.join(projectDir, outDirName, "linux", "resources", "app", "ignoreMe")).doesNotExist(),
      ])
    },
  })
})

test("extraResources", async () => {
  for (let platform of getPossiblePlatforms().keys()) {
    const osName = platform.buildConfigurationKey

    const winDirPrefix = "lib/net45/resources/"

    //noinspection SpellCheckingInspection
    await assertPack("test-app", {
      // to check NuGet package
      targets: platform.createTarget(platform === Platform.WINDOWS ? null : DIR_TARGET),
    }, {
      tempDirCreated: projectDir => {
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
          outputFile(path.join(projectDir, "foo", ".dot"), "data"),
          outputFile(path.join(projectDir, `bar/${process.arch}.txt`), "data"),
          outputFile(path.join(projectDir, `${osName}/${process.arch}.txt`), "data"),
          outputFile(path.join(projectDir, "platformSpecificR"), "platformSpecificR"),
          outputFile(path.join(projectDir, "ignoreMe.txt"), "ignoreMe"),
        ])
      },
      packed: async (projectDir) => {
        const base = path.join(projectDir, outDirName, platform.buildConfigurationKey)
        let resourcesDir = path.join(base, "resources")
        if (platform === Platform.MAC) {
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
        await assertThat(path.join(resourcesDir, "foo", ".dot")).doesNotExist()
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
