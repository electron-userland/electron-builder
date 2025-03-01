import { TmpDir, archFromString, copyDir } from "builder-util"
import { DIR_TARGET, Platform } from "electron-builder"
import { outputFile } from "fs-extra"
import * as fs from "fs/promises"
import * as path from "path"
import { Mode, RWX } from "stat-mode"
import { assertThat } from "./helpers/fileAssert"
import { app, appThrows, assertPack, checkDirContents, linuxDirTarget, modifyPackageJson } from "./helpers/packTester"
import { ExpectStatic } from "vitest"

test.ifDevOrLinuxCi("expand not defined env", ({ expect }) =>
  appThrows(expect, {
    targets: linuxDirTarget,
    config: {
      asar: false,
      // tslint:disable:no-invalid-template-strings
      files: ["${env.FOO_NOT_DEFINED}"],
    },
  })
)

process.env.__NOT_BAR__ = "!**/bar"

test.ifDevOrLinuxCi("files", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        asar: false,
        // tslint:disable:no-invalid-template-strings
        files: ["**/*", "!ignoreMe${/*}", "${env.__NOT_BAR__}", "dist/electron/**/*"],
      },
    },
    {
      projectDirCreated: projectDir =>
        Promise.all([
          outputFile(path.join(projectDir, "ignoreMe", "foo"), "data"),
          outputFile(path.join(projectDir, "ignoreEmptyDir", "bar"), "data"),
          outputFile(path.join(projectDir, "test.h"), "test that"),
          outputFile(path.join(projectDir, "dist/electron/foo.js"), "data"),
        ]),
      packed: context => {
        const resources = path.join(context.getResources(Platform.LINUX), "app")
        return checkDirContents(expect, resources)
      },
    }
  )
)

test.ifDevOrLinuxCi("files.from asar", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        asar: true,
        files: [
          {
            from: ".",
            to: ".",
            filter: ["package.json"],
          },
          {
            from: "app/node",
            to: "app/node",
          },
        ],
      },
    },
    {
      projectDirCreated: projectDir =>
        Promise.all([
          fs.mkdir(path.join(projectDir, "app/node"), { recursive: true }).then(() => fs.rename(path.join(projectDir, "index.js"), path.join(projectDir, "app/node/index.js"))),
          modifyPackageJson(projectDir, data => {
            data.main = "app/node/index.js"
          }),
        ]),
    }
  )
)

test.ifNotWindows("map resources", ({ expect }) =>
  app(
    expect,
    {
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
      },
    },
    {
      projectDirCreated: projectDir => Promise.all([outputFile(path.join(projectDir, "foo", "old"), "data"), outputFile(path.join(projectDir, "license.txt"), "data")]),
      packed: context => {
        const resources = context.getResources(Platform.LINUX)
        return Promise.all([
          assertThat(expect, path.join(resources, "app", "foo", "old")).doesNotExist(),
          assertThat(expect, path.join(resources, "foo", "new")).isFile(),
          assertThat(expect, path.join(resources, "license.txt")).isFile(),
        ])
      },
    }
  )
)

async function doExtraResourcesTest(expect: ExpectStatic, platform: Platform) {
  const osName = platform.buildConfigurationKey
  await assertPack(
    expect,
    "test-app-one",
    {
      // to check NuGet package
      targets: platform.createTarget(platform === Platform.WINDOWS ? "squirrel" : DIR_TARGET),
      config: {
        extraResources: ["foo", "bar/hello.txt", "./dir-relative/f.txt", "bar/${arch}.txt", "${os}/${arch}.txt"],
        [osName]: {
          extraResources: ["platformSpecificR"],
          extraFiles: ["platformSpecificF"],
        },
      },
    },
    {
      projectDirCreated: async projectDir => {
        return Promise.all([
          outputFile(path.resolve(projectDir, "foo/nameWithoutDot"), "nameWithoutDot"),
          outputFile(path.resolve(projectDir, "bar/hello.txt"), "data"),
          outputFile(path.resolve(projectDir, "dir-relative/f.txt"), "data"),
          outputFile(path.resolve(projectDir, `bar/${process.arch}.txt`), "data"),
          outputFile(path.resolve(projectDir, `${osName}/${process.arch}.txt`), "data"),
          outputFile(path.resolve(projectDir, "platformSpecificR"), "platformSpecificR"),
          outputFile(path.resolve(projectDir, "ignoreMe.txt"), "ignoreMe"),
        ])
      },
      packed: async context => {
        const resourcesDir = context.getResources(platform, archFromString(process.arch))
        return Promise.all([
          assertThat(expect, path.resolve(resourcesDir, "foo")).isDirectory(),
          assertThat(expect, path.resolve(resourcesDir, "foo", "nameWithoutDot")).isFile(),
          assertThat(expect, path.resolve(resourcesDir, "bar", "hello.txt")).isFile(),
          assertThat(expect, path.resolve(resourcesDir, "dir-relative", "f.txt")).isFile(),
          assertThat(expect, path.resolve(resourcesDir, "bar", `${process.arch}.txt`)).isFile(),
          assertThat(expect, path.resolve(resourcesDir, osName, `${process.arch}.txt`)).isFile(),
          assertThat(expect, path.resolve(resourcesDir, "platformSpecificR")).isFile(),
          assertThat(expect, path.resolve(resourcesDir, "ignoreMe.txt")).doesNotExist(),
        ])
      },
    }
  )
}

test.ifDevOrLinuxCi("extraResources on Linux", ({ expect }) => doExtraResourcesTest(expect, Platform.LINUX))

// Squirrel.Windows is not supported on macOS anymore (32-bit)
// Skipped due to bug in rimraf on Windows: `at fixWinEPERM (../node_modules/.pnpm/fs-extra@8.1.0/node_modules/fs-extra/lib/remove/rimraf.js:117:5)`
test.ifLinux("extraResources on Windows", ({ expect }) => doExtraResourcesTest(expect, Platform.WINDOWS))

test.ifMac("extraResources on macOS", ({ expect }) => doExtraResourcesTest(expect, Platform.MAC))

test.ifNotWindows.ifNotCiWin("extraResources - two-package", ({ expect }) => {
  const platform = Platform.LINUX
  const osName = platform.buildConfigurationKey

  //noinspection SpellCheckingInspection
  return assertPack(
    expect,
    "test-app",
    {
      // to check NuGet package
      targets: platform.createTarget(DIR_TARGET),
      config: {
        asar: true,
        extraResources: ["foo", "bar/hello.txt", "bar/${arch}.txt", "${os}/${arch}.txt", "executable*"],
        [osName]: {
          extraResources: ["platformSpecificR"],
          extraFiles: ["platformSpecificF"],
        },
      },
    },
    {
      projectDirCreated: projectDir => {
        return Promise.all([
          outputFile(path.join(projectDir, "foo/nameWithoutDot"), "nameWithoutDot"),
          outputFile(path.join(projectDir, "bar/hello.txt"), "data", { mode: 0o400 }),
          outputFile(path.join(projectDir, `bar/${process.arch}.txt`), "data"),
          outputFile(path.join(projectDir, `${osName}/${process.arch}.txt`), "data"),
          outputFile(path.join(projectDir, "platformSpecificR"), "platformSpecificR"),
          outputFile(path.join(projectDir, "ignoreMe.txt"), "ignoreMe"),
          outputFile(path.join(projectDir, "executable"), "executable", { mode: 0o755 }),
          outputFile(path.join(projectDir, "executableOnlyOwner"), "executable", { mode: 0o740 }),
        ])
      },
      packed: async context => {
        const resourcesDir = context.getResources(platform, archFromString(process.arch))
        const appDir = path.join(resourcesDir, "app")

        await Promise.all([
          assertThat(expect, path.join(resourcesDir, "foo")).isDirectory(),
          assertThat(expect, path.join(appDir, "foo")).doesNotExist(),

          assertThat(expect, path.join(resourcesDir, "foo", "nameWithoutDot")).isFile(),
          assertThat(expect, path.join(appDir, "foo", "nameWithoutDot")).doesNotExist(),

          assertThat(expect, path.join(resourcesDir, "bar", "hello.txt")).isFile(),
          assertThat(expect, path.join(resourcesDir, "bar", `${process.arch}.txt`)).isFile(),
          assertThat(expect, path.join(appDir, "bar", `${process.arch}.txt`)).doesNotExist(),

          assertThat(expect, path.join(resourcesDir, osName, `${process.arch}.txt`)).isFile(),
          assertThat(expect, path.join(resourcesDir, "platformSpecificR")).isFile(),
          assertThat(expect, path.join(resourcesDir, "ignoreMe.txt")).doesNotExist(),

          allCan(path.join(resourcesDir, "executable"), true),
          allCan(path.join(resourcesDir, "executableOnlyOwner"), true),

          allCan(path.join(resourcesDir, "bar", "hello.txt"), false),
        ])

        expect(await fs.readFile(path.join(resourcesDir, "bar", "hello.txt"), "utf-8")).toEqual("data")
      },
    }
  )
})

// https://github.com/electron-userland/electron-builder/pull/998
// copyDir walks to a symlink referencing a file that has not yet been copied by postponing the linking step until after the full walk is complete
test.ifNotWindows("postpone symlink", async ({ expect }) => {
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
