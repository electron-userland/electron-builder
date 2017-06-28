import BluebirdPromise from "bluebird-lst"
import { DIR_TARGET, Platform } from "electron-builder"
import { TmpDir } from "electron-builder-util"
import { copyDir } from "electron-builder-util/out/fs"
import { outputFile, readFile, stat, symlink } from "fs-extra-p"
import * as path from "path"
import Mode, { Permissions } from "stat-mode"
import { assertThat } from "./helpers/fileAssert"
import { app, appThrows, assertPack } from "./helpers/packTester"

const linuxDirTarget = Platform.LINUX.createTarget(DIR_TARGET)

test.ifDevOrLinuxCi("expand not defined env", appThrows({
  targets: linuxDirTarget,
  config: {
    asar: false,
    files: ["${env.FOO_NOT_DEFINED}"],
  }
}))

process.env.__NOT_BAR__ = "!**/bar"

test.ifDevOrLinuxCi("files", app({
  targets: linuxDirTarget,
  config: {
    asar: false,
    files: ["**/*", "!ignoreMe${/*}", "${env.__NOT_BAR__}", "dist/electron/**/*"],
  }
}, {
  projectDirCreated: projectDir => BluebirdPromise.all([
    outputFile(path.join(projectDir, "ignoreMe", "foo"), "data"),
    outputFile(path.join(projectDir, "ignoreEmptyDir", "bar"), "data"),
    outputFile(path.join(projectDir, "dist/electron/foo.js"), "data"),
  ]),
  packed: context => {
    const resources = path.join(context.getResources(Platform.LINUX), "app")
    return BluebirdPromise.all([
      assertThat(path.join(resources, "ignoreMe")).doesNotExist(),
      assertThat(path.join(resources, "ignoreEmptyDir")).doesNotExist(),
      assertThat(path.join(resources, "dist/electron")).isDirectory(),
    ])
  },
}))

test.ifDevOrLinuxCi("map resources", app({
  targets: linuxDirTarget,
  config: {
    asar: false,
    extraResources: [
      {
        from: "foo/old",
        to: "foo/new",
      },
      {
        from: "license.txt",
        to: ".",
      },
    ],
  }
}, {
  projectDirCreated: projectDir => BluebirdPromise.all([
    outputFile(path.join(projectDir, "foo", "old"), "data"),
    outputFile(path.join(projectDir, "license.txt"), "data"),
  ]),
  packed: context => {
    const resources = path.join(context.getResources(Platform.LINUX))
    return BluebirdPromise.all([
      assertThat(path.join(resources, "app", "foo", "old")).doesNotExist(),
      assertThat(path.join(resources, "foo", "new")).isFile(),
      assertThat(path.join(resources, "license.txt")).isFile(),
    ])
  },
}))

async function doExtraResourcesTest(platform: Platform) {
  const osName = platform.buildConfigurationKey
  //noinspection SpellCheckingInspection
  await assertPack("test-app-one", {
    // to check NuGet package
    targets: platform.createTarget(platform === Platform.WINDOWS ? "squirrel" : DIR_TARGET),
    config: {
      extraResources: [
        "foo",
        "bar/hello.txt",
        "./dir-relative/f.txt",
        "bar/${arch}.txt",
        "${os}/${arch}.txt",
      ],
      [osName]: {
        extraResources: [
          "platformSpecificR"
        ],
        extraFiles: [
          "platformSpecificF"
        ],
      }
    },
  }, {
    projectDirCreated: projectDir => {
      return BluebirdPromise.all([
        outputFile(path.join(projectDir, "foo/nameWithoutDot"), "nameWithoutDot"),
        outputFile(path.join(projectDir, "bar/hello.txt"), "data"),
        outputFile(path.join(projectDir, "dir-relative/f.txt"), "data"),
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
        assertThat(path.join(resourcesDir, "dir-relative", "f.txt")).isFile(),
        assertThat(path.join(resourcesDir, "bar", `${process.arch}.txt`)).isFile(),
        assertThat(path.join(resourcesDir, osName, `${process.arch}.txt`)).isFile(),
        assertThat(path.join(resourcesDir, "platformSpecificR")).isFile(),
        assertThat(path.join(resourcesDir, "ignoreMe.txt")).doesNotExist(),
      ])
    },
  })
}

test.ifDevOrLinuxCi("extraResources on Linux and Windows", async () => {
  await doExtraResourcesTest(Platform.LINUX)
  await doExtraResourcesTest(Platform.WINDOWS)
})

test.ifMac("extraResources on macOS", async () => {
  await doExtraResourcesTest(Platform.MAC)
})

test.ifNotCiWin("extraResources - two-package", () => {
  const platform = Platform.LINUX
  const osName = platform.buildConfigurationKey

  //noinspection SpellCheckingInspection
  return assertPack("test-app", {
    // to check NuGet package
    targets: platform.createTarget(DIR_TARGET),
    config: {
      asar: true,
      extraResources: [
        "foo",
        "bar/hello.txt",
        "bar/${arch}.txt",
        "${os}/${arch}.txt",
        "executable*",
      ],
      [osName]: {
        extraResources: [
          "platformSpecificR"
        ],
        extraFiles: [
          "platformSpecificF"
        ],
      },
    },
  }, {
    projectDirCreated: projectDir => {
      return BluebirdPromise.all([
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
      const base = path.join(context.outDir, `${platform.buildConfigurationKey}-unpacked`)
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