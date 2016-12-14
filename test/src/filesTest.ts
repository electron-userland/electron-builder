import { expectedWinContents } from "./helpers/expectedContents"
import { outputFile, stat, symlink, readFile } from "fs-extra-p"
import { assertPack, modifyPackageJson, getPossiblePlatforms, app } from "./helpers/packTester"
import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { Platform, DIR_TARGET } from "out"
import pathSorter from "path-sort"
import Mode from "stat-mode"
import { Permissions } from "stat-mode"
import { TmpDir } from "out/util/tmp"
import { copyDir } from "out/util/fs"

test.ifDevOrLinuxCi("files", app({
  targets: Platform.LINUX.createTarget(DIR_TARGET),
  config: {
    asar: false,
    files: ["!ignoreMe${/*}", "!**/bar"],
  }
}, {
  projectDirCreated: projectDir => BluebirdPromise.all([
    outputFile(path.join(projectDir, "ignoreMe", "foo"), "data"),
    outputFile(path.join(projectDir, "ignoreEmptyDir", "bar"), "data"),
  ]),
  packed: context => {
    const resources = path.join(context.getResources(Platform.LINUX), "app")
    return BluebirdPromise.all([
      assertThat(path.join(resources, "ignoreMe")).doesNotExist(),
      assertThat(path.join(resources, "ignoreEmptyDir")).doesNotExist(),
    ])
  },
}))

test.ifNotCiWin("extraResources", async () => {
  for (const platform of getPossiblePlatforms().keys()) {
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

test.ifNotCiWin("extraResources - one-package", () => {
  const platform = process.platform === "win32" ? Platform.WINDOWS : Platform.LINUX
  const osName = platform.buildConfigurationKey

  const winDirPrefix = "lib/net45/resources/"

  //noinspection SpellCheckingInspection
  return assertPack("test-app-one", {
    // to check NuGet package
    targets: platform.createTarget(platform === Platform.WINDOWS ? "squirrel" : DIR_TARGET),
    config: {
      asar: true,
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
            "executable*",
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
        outputFile(path.join(projectDir, "bar/hello.txt"), "data", {mode: "400"}),
        outputFile(path.join(projectDir, `bar/${process.arch}.txt`), "data"),
        outputFile(path.join(projectDir, `${osName}/${process.arch}.txt`), "data"),
        outputFile(path.join(projectDir, "platformSpecificR"), "platformSpecificR"),
        outputFile(path.join(projectDir, "ignoreMe.txt"), "ignoreMe"),
        outputFile(path.join(projectDir, "executable"), "executable", {mode: "755"}),
        outputFile(path.join(projectDir, "executableOnlyOwner"), "executable", {mode: "740"}),
      ])
    },
    packed: async context => {
      const base = path.join(context.outDir, platform.buildConfigurationKey + `${platform === Platform.MAC ? "" : "-unpacked"}`)
      let resourcesDir = path.join(base, "resources")
      if (platform === Platform.MAC) {
        resourcesDir = path.join(base, "TestApp.app", "Contents", "Resources")
      }
      const appDir = path.join(resourcesDir, "app")

      await BluebirdPromise.all([
        assertThat(path.join(resourcesDir, "foo")).isDirectory(),
        assertThat(path.join(appDir, "foo")).doesNotExist(),

        assertThat(path.join(resourcesDir, "foo", "nameWithoutDot")).isFile(),
        assertThat(path.join(appDir, "foo", "nameWithoutDot")).doesNotExist(),

        assertThat(path.join(resourcesDir, "bar", "hello.txt")).isFile(),
        assertThat(path.join(resourcesDir, "bar", `${process.arch}.txt`)).isFile(),
        assertThat(path.join(appDir, "bar", `${process.arch}.txt`)).doesNotExist(),

        assertThat(path.join(resourcesDir, osName, `${process.arch}.txt`)).isFile(),
        assertThat(path.join(resourcesDir, "platformSpecificR")).isFile(),
        assertThat(path.join(resourcesDir, "ignoreMe.txt")).doesNotExist(),

        allCan(path.join(resourcesDir, "executable"), true),
        allCan(path.join(resourcesDir, "executableOnlyOwner"), true),

        allCan(path.join(resourcesDir, "bar", "hello.txt"), false),
      ])

      expect(await readFile(path.join(resourcesDir, "bar", "hello.txt"), "utf-8")).toEqual("data")
    },
    expectedContents: platform === Platform.WINDOWS ? pathSorter(expectedWinContents.concat(
      winDirPrefix + "bar/hello.txt",
      winDirPrefix + "bar/x64.txt",
      winDirPrefix + "foo/nameWithoutDot",
      winDirPrefix + "platformSpecificR",
      winDirPrefix + "win/x64.txt"
    )) : null,
  })
})

// https://github.com/electron-userland/electron-builder/pull/998
// copyDir walks to a symlink referencing a file that has not yet been copied by postponing the linking step until after the full walk is complete
test("postpone symlink", async () => {
  const tmpDir = new TmpDir()
  const source = await tmpDir.getTempFile("src")
  const aSourceFile = path.join(source, "z", "Z")
  const bSourceFileLink = path.join(source, "B")
  await outputFile(aSourceFile, "test")
  await symlink(aSourceFile, bSourceFileLink)


  const dest = await tmpDir.getTempFile("dest")
  await copyDir(source, dest)

  await tmpDir.cleanup()
})

async function allCan(file: string, execute: Boolean) {
  const mode = new Mode(await stat(file))

  function checkExecute(value: Permissions) {
    if (value.execute !== execute) {
      throw new Error(`${file} is ${execute ? "not " : ""}executable`)
    }
  }

  function checkRead(value: Permissions) {
    if (!value.read) {
      throw new Error(`${file} is not readable`)
    }
  }

  checkExecute(mode.owner)
  checkExecute(mode.group)
  checkExecute(mode.others)

  checkRead(mode.owner)
  checkRead(mode.group)
  checkRead(mode.others)
}