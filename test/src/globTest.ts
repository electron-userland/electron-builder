import test from "./helpers/avaEx"
import { expectedWinContents } from "./helpers/expectedContents"
import { outputFile, symlink } from "fs-extra-p"
import { assertPack, modifyPackageJson, getPossiblePlatforms, app, appThrows } from "./helpers/packTester"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { Platform, DIR_TARGET } from "out"
import pathSorter = require("path-sort")
import { statFile } from "asar-electron-builder"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("out/util/awaiter")

test.ifDevOrLinuxCi("ignore build resources", app({
  targets: Platform.LINUX.createTarget(DIR_TARGET),
  devMetadata: {
    build: {
      asar: false
    }
  }
}, {
  projectDirCreated: projectDir => {
    return outputFile(path.join(projectDir, "one/build/foo.txt"), "data")
  },
  packed: context => {
    return assertThat(path.join(context.getResources(Platform.LINUX), "app", "one", "build", "foo.txt")).isFile()
  },
}))

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

test.ifDevOrLinuxCi("unpackDir one", app({
  targets: Platform.LINUX.createTarget(DIR_TARGET),
  devMetadata: {
    build: {
      asar: {
        unpackDir: "{assets,b2}"
      },
    }
  }
}, {
  projectDirCreated: projectDir => {
    return BluebirdPromise.all([
      outputFile(path.join(projectDir, "assets", "file"), "data"),
      outputFile(path.join(projectDir, "b2", "file"), "data"),
    ])
  },
  packed: context => {
    return BluebirdPromise.all([
      assertThat(path.join(context.getResources(Platform.LINUX), "app.asar.unpacked", "assets")).isDirectory(),
      assertThat(path.join(context.getResources(Platform.LINUX), "app.asar.unpacked", "b2")).isDirectory(),
    ])
  },
}))

test.ifDevOrLinuxCi("unpackDir", () => {
  return assertPack("test-app", {
    targets: Platform.LINUX.createTarget(DIR_TARGET),
    devMetadata: {
      build: {
        asar: {
          unpackDir: "{assets,b2}"
        },
      }
    }
  }, {
    projectDirCreated: projectDir => {
      return BluebirdPromise.all([
        outputFile(path.join(projectDir, "app", "assets", "file"), "data"),
        outputFile(path.join(projectDir, "app", "b2", "file"), "data"),
      ])
    },
    packed: context => {
      return BluebirdPromise.all([
        assertThat(path.join(context.getResources(Platform.LINUX), "app.asar.unpacked", "assets")).isDirectory(),
        assertThat(path.join(context.getResources(Platform.LINUX), "app.asar.unpacked", "b2")).isDirectory(),
      ])
    },
  })
})

test.ifNotWindows("link", app({
  targets: Platform.LINUX.createTarget(DIR_TARGET),
}, {
  projectDirCreated: projectDir => {
    return symlink(path.join(projectDir, "index.js"), path.join(projectDir, "foo.js"))
  },
  packed: async context => {
    assertThat(statFile(path.join(context.getResources(Platform.LINUX), "app.asar"), "foo.js", false)).hasProperties({
      link: "index.js",
    })
  },
}))

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
    projectDirCreated: projectDir => {
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
    packed: context => {
      return BluebirdPromise.all([
        assertThat(path.join(context.getResources(Platform.LINUX), "app", "node_modules", "electron-osx-sign")).doesNotExist(),
        assertThat(path.join(context.getResources(Platform.LINUX), "app", "ignoreMe")).doesNotExist(),
      ])
    },
  })
})

// https://github.com/electron-userland/electron-builder/issues/611
test.ifDevOrLinuxCi("failed peer dep", () => {
  return assertPack("test-app-one", {
    targets: Platform.LINUX.createTarget(DIR_TARGET),
  }, {
    npmInstallBefore: true,
    projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
      //noinspection SpellCheckingInspection
      data.dependencies = {
        "rc-datepicker": "4.0.0",
        "react": "15.2.1",
        "react-dom": "15.2.1"
      }
    }),
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
          outputFile(path.join(projectDir, "foo", ".dot"), "data"),
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

test("extraResources - one-package", async () => {
  for (let platform of [process.platform === "win32" ? Platform.WINDOWS : Platform.LINUX]) {
    const osName = platform.buildConfigurationKey

    const winDirPrefix = "lib/net45/resources/"

    //noinspection SpellCheckingInspection
    await assertPack("test-app-one", {
      // to check NuGet package
      targets: platform.createTarget(platform === Platform.WINDOWS ? null : DIR_TARGET),
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
          outputFile(path.join(projectDir, "foo", ".dot"), "data"),
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

test.ifDevOrLinuxCi("copy only js files - no asar", appThrows(/Application "package.json" does not exist/, {
  targets: Platform.LINUX.createTarget(DIR_TARGET),
  devMetadata: {
    build: {
      "files": ["**/*.js"],
      asar: false,
    }
  }
}))

test.ifDevOrLinuxCi("copy only js files - asar", appThrows(/Application "package.json" in the /, {
  targets: Platform.LINUX.createTarget(DIR_TARGET),
  devMetadata: {
    build: {
      "files": ["**/*.js"],
      asar: true,
    }
  }
}))