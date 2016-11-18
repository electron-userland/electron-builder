import { outputFile, symlink } from "fs-extra-p"
import { assertPack, modifyPackageJson, app } from "./helpers/packTester"
import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { Platform, DIR_TARGET } from "out"
import { statFile } from "asar-electron-builder"

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