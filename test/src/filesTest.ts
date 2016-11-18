import { expectedWinContents } from "./helpers/expectedContents"
import { outputFile } from "fs-extra-p"
import { assertPack, modifyPackageJson, getPossiblePlatforms, app } from "./helpers/packTester"
import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { Platform, DIR_TARGET } from "out"
import pathSorter from "path-sort"

test.ifDevOrLinuxCi("files", app({
  targets: Platform.LINUX.createTarget(DIR_TARGET),
  devMetadata: {
    build: {
      asar: false,
      files: ["**/*", "!ignoreMe${/*}"]
    }
  }
}, {
  projectDirCreated: projectDir => {
    return outputFile(path.join(projectDir, "ignoreMe", "foo"), "data")
  },
  packed: context => {
    return assertThat(path.join(context.getResources(Platform.LINUX), "app", "ignoreMe")).doesNotExist()
  },
}))

test("extraResources", async () => {
  for (let platform of getPossiblePlatforms().keys()) {
    const osName = platform.buildConfigurationKey

    const winDirPrefix = "lib/net45/resources/"

    //noinspection SpellCheckingInspection
    await assertPack("test-app-one", {
      // to check NuGet package
      targets: platform.createTarget(platform === Platform.WINDOWS ? "squirrel" : DIR_TARGET),
    }, {
      projectDirCreated: projectDir => {
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
      packed: context => {
        const base = path.join(context.outDir, `${platform.buildConfigurationKey}${platform === Platform.MAC ? "" : "-unpacked"}`)
        let resourcesDir = path.join(base, "resources")
        if (platform === Platform.MAC) {
          resourcesDir = path.join(base, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
        }

        return BluebirdPromise.all([
          assertThat(path.join(resourcesDir, "foo")).isDirectory(),
          assertThat(path.join(resourcesDir, "foo", "nameWithoutDot")).isFile(),
          assertThat(path.join(resourcesDir, "bar", "hello.txt")).isFile(),
          assertThat(path.join(resourcesDir, "bar", `${process.arch}.txt`)).isFile(),
          assertThat(path.join(resourcesDir, osName, `${process.arch}.txt`)).isFile(),
          assertThat(path.join(resourcesDir, "platformSpecificR")).isFile(),
          assertThat(path.join(resourcesDir, "ignoreMe.txt")).doesNotExist(),
        ])
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

test("extraResources - one-package", async () => {
  for (let platform of [process.platform === "win32" ? Platform.WINDOWS : Platform.LINUX]) {
    const osName = platform.buildConfigurationKey

    const winDirPrefix = "lib/net45/resources/"

    //noinspection SpellCheckingInspection
    await assertPack("test-app-one", {
      // to check NuGet package
      targets: platform.createTarget(platform === Platform.WINDOWS ? "squirrel" : DIR_TARGET),
      devMetadata: {
        build: {
          asar: true,
        },
      },
    }, {
      projectDirCreated: projectDir => {
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
      packed: async context => {
        const base = path.join(context.outDir, platform.buildConfigurationKey + `${platform === Platform.MAC ? "" : "-unpacked"}`)
        let resourcesDir = path.join(base, "resources")
        if (platform === Platform.MAC) {
          resourcesDir = path.join(base, "TestApp.app", "Contents", "Resources")
        }
        const appDir = path.join(resourcesDir, "app")

        await assertThat(path.join(resourcesDir, "foo")).isDirectory()
        await assertThat(path.join(appDir, "foo")).doesNotExist()

        await assertThat(path.join(resourcesDir, "foo", "nameWithoutDot")).isFile()
        await assertThat(path.join(appDir, "foo", "nameWithoutDot")).doesNotExist()

        await assertThat(path.join(resourcesDir, "bar", "hello.txt")).isFile()
        await assertThat(path.join(resourcesDir, "bar", `${process.arch}.txt`)).isFile()
        await assertThat(path.join(appDir, "bar", `${process.arch}.txt`)).doesNotExist()

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