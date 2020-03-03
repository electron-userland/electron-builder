import { DIR_TARGET, Platform } from "electron-builder"
import { TmpDir } from "builder-util"
import { copyDir } from "builder-util/out/fs"
import { outputFile } from "fs-extra"
import { promises as fs } from "fs"
import * as path from "path"
import { Mode, RWX } from "stat-mode"
import { assertThat } from "./helpers/fileAssert"
import { app, appThrows, assertPack, checkDirContents, linuxDirTarget, modifyPackageJson } from "./helpers/packTester"

test.ifDevOrLinuxCi("expand not defined env", appThrows({
  targets: linuxDirTarget,
  config: {
    asar: false,
    // tslint:disable:no-invalid-template-strings
    files: ["${env.FOO_NOT_DEFINED}"],
  }
}))

process.env.__NOT_BAR__ = "!**/bar"

test.ifDevOrLinuxCi("files", app({
  targets: linuxDirTarget,
  config: {
    asar: false,
    // tslint:disable:no-invalid-template-strings
    files: ["**/*", "!ignoreMe${/*}", "${env.__NOT_BAR__}", "dist/electron/**/*"],
  }
}, {
  projectDirCreated: projectDir => Promise.all([
    outputFile(path.join(projectDir, "ignoreMe", "foo"), "data"),
    outputFile(path.join(projectDir, "ignoreEmptyDir", "bar"), "data"),
    outputFile(path.join(projectDir, "test.h"), "test that"),
    outputFile(path.join(projectDir, "dist/electron/foo.js"), "data"),
  ]),
  packed: context => {
    const resources = path.join(context.getResources(Platform.LINUX), "app")
    return checkDirContents(resources)
  },
}))

test.ifDevOrLinuxCi("files.from asar", app({
  targets: linuxDirTarget,
  config: {
    asar: true,
    files: [
      {
        from: ".",
        to: ".",
        filter: ["package.json"]
      },
      {
        from: "app/node",
        to: "app/node"
      },
    ],
  },
}, {
  projectDirCreated: projectDir => Promise.all([
    fs.mkdir(path.join(projectDir, "app/node"), {recursive: true}).then(() => fs.rename(path.join(projectDir, "index.js"), path.join(projectDir, "app/node/index.js"))),
    modifyPackageJson(projectDir, data => {
      data.main = "app/node/index.js"
    })
  ]),
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
  projectDirCreated: projectDir => Promise.all([
    outputFile(path.join(projectDir, "foo", "old"), "data"),
    outputFile(path.join(projectDir, "license.txt"), "data"),
  ]),
  packed: context => {
    const resources = path.join(context.getResources(Platform.LINUX))
    return Promise.all([
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
      return Promise.all([
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

      return Promise.all([
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

test.ifDevOrLinuxCi("extraResources on Linux", () => doExtraResourcesTest(Platform.LINUX))

// Squirrel.Windows is not supported on macOS anymore (32-bit)
test.ifNotMac.ifDevOrWinCi("extraResources on Windows", () => doExtraResourcesTest(Platform.WINDOWS))

test.ifMac("extraResources on macOS", async () => {
  await doExtraResourcesTest(Platform.MAC)
})

test.ifNotWindows.ifNotCiWin("extraResources - two-package", () => {
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
      return Promise.all([
        outputFile(path.join(projectDir, "foo/nameWithoutDot"), "nameWithoutDot"),
        outputFile(path.join(projectDir, "bar/hello.txt"), "data", {mode: 0o400}),
        outputFile(path.join(projectDir, `bar/${process.arch}.txt`), "data"),
        outputFile(path.join(projectDir, `${osName}/${process.arch}.txt`), "data"),
        outputFile(path.join(projectDir, "platformSpecificR"), "platformSpecificR"),
        outputFile(path.join(projectDir, "ignoreMe.txt"), "ignoreMe"),
        outputFile(path.join(projectDir, "executable"), "executable", {mode: 0o755}),
        outputFile(path.join(projectDir, "executableOnlyOwner"), "executable", {mode: 0o740}),
      ])
    },
    packed: async context => {
      const base = path.join(context.outDir, `${platform.buildConfigurationKey}-unpacked`)
      let resourcesDir = path.join(base, "resources")
      if (platform === Platform.MAC) {
        resourcesDir = path.join(base, "TestApp.app", "Contents", "Resources")
      }
      const appDir = path.join(resourcesDir, "app")

      await Promise.all([
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

      expect(await fs.readFile(path.join(resourcesDir, "bar", "hello.txt"), "utf-8")).toEqual("data")
    },
  })
})

// https://github.com/electron-userland/electron-builder/pull/998
// copyDir walks to a symlink referencing a file that has not yet been copied by postponing the linking step until after the full walk is complete
test.ifNotWindows("postpone symlink", async () => {
  const tmpDir = new TmpDir("files-test")
  const source = await tmpDir.getTempDir()
  const aSourceFile = path.join(source, "z", "Z")
  const bSourceFileLink = path.join(source, "B")
  await outputFile(aSourceFile, "test")
  await fs.symlink(aSourceFile, bSourceFileLink)

  const dest = await tmpDir.getTempDir()
  await copyDir(source, dest)

  await tmpDir.cleanup()
})

async function allCan(file: string, execute: boolean) {
  const mode = new Mode(await fs.stat(file))

  function checkExecute(value: RWX) {
    if (value.execute !== execute) {
      throw new Error(`${file} is ${execute ? "not " : ""}executable`)
    }
  }

  function checkRead(value: RWX) {
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