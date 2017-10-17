import BluebirdPromise from "bluebird-lst"
import { DIR_TARGET, Platform } from "electron-builder"
import { readAsar } from "electron-builder/out/asar/asar"
import { mkdirs, outputFile, readFile, symlink, writeFile } from "fs-extra-p"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { app, assertPack, modifyPackageJson, PackedContext } from "./helpers/packTester"

async function createFiles(appDir: string) {
  await BluebirdPromise.all([
    outputFile(path.join(appDir, "assets", "file"), "data"),
    outputFile(path.join(appDir, "b2", "file"), "data"),
    outputFile(path.join(appDir, "do-not-unpack-dir", "file.json"), "{}")
      .then(() => writeFile(path.join(appDir, "do-not-unpack-dir", "must-be-not-unpacked"), "{}"))
  ])

  const dir = path.join(appDir, "do-not-unpack-dir", "dir-2", "dir-3", "dir-3")
  await mkdirs(dir)
  await writeFile(path.join(dir, "file-in-asar"), "{}")
}

test.ifDevOrLinuxCi("unpackDir one", app({
  targets: Platform.LINUX.createTarget(DIR_TARGET),
  config: {
    asarUnpack: ["assets", "b2", "do-not-unpack-dir/file.json"],
  }
}, {
  projectDirCreated: createFiles,
  packed: assertDirs,
}))

async function assertDirs(context: PackedContext) {
  const resourceDir = context.getResources(Platform.LINUX)
  await BluebirdPromise.all([
    assertThat(path.join(resourceDir, "app.asar.unpacked", "assets")).isDirectory(),
    assertThat(path.join(resourceDir, "app.asar.unpacked", "b2")).isDirectory(),
    assertThat(path.join(resourceDir, "app.asar.unpacked", "do-not-unpack-dir", "file.json")).isFile(),
    assertThat(path.join(resourceDir, "app.asar.unpacked", "do-not-unpack-dir", "must-be-not-unpacked")).doesNotExist(),
    assertThat(path.join(resourceDir, "app.asar.unpacked", "do-not-unpack-dir", "dir-2")).doesNotExist(),
  ])

  expect((await readFile(path.join(resourceDir, "app.asar"))).toString("base64")).toMatchSnapshot()
}
test.ifDevOrLinuxCi("unpackDir", () => {
  return assertPack("test-app", {
    targets: Platform.LINUX.createTarget(DIR_TARGET),
    config: {
      asarUnpack: ["assets", "b2", "do-not-unpack-dir/file.json"],
    }
  }, {
    projectDirCreated: projectDir => createFiles(path.join(projectDir, "app")),
    packed: assertDirs,
  })
})

test.ifNotWindows("link", app({
  targets: Platform.LINUX.createTarget(DIR_TARGET),
}, {
  projectDirCreated: projectDir => {
    return symlink(path.join(projectDir, "index.js"), path.join(projectDir, "foo.js"))
  },
  packed: async context => {
    expect((await readAsar(path.join(context.getResources(Platform.LINUX), "app.asar"))).getFile("foo.js", false)).toMatchSnapshot()
  },
}))

test.ifNotWindows("outside link", app({
  targets: Platform.LINUX.createTarget(DIR_TARGET),
}, {
  projectDirCreated: async (projectDir, tmpDir) => {
    const tempDir = await tmpDir.getTempDir()
    await outputFile(path.join(tempDir, "foo"), "data")
    await symlink(tempDir, path.join(projectDir, "o-dir"))
  },
  packed: async context => {
    expect((await readAsar(path.join(context.getResources(Platform.LINUX), "app.asar"))).getFile("o-dir/foo", false)).toMatchSnapshot()
  },
}))

// https://github.com/electron-userland/electron-builder/issues/611
test.ifDevOrLinuxCi("failed peer dep", () => {
  return assertPack("test-app-one", {
    targets: Platform.LINUX.createTarget(DIR_TARGET),
  }, {
    installDepsBefore: true,
    projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
      //noinspection SpellCheckingInspection
      data.dependencies = {
        "rc-datepicker": "4.0.0",
        react: "15.2.1",
        "react-dom": "15.2.1"
      }
    }),
  })
})

test.ifAll.ifDevOrLinuxCi("ignore node_modules", () => {
  return assertPack("test-app-one", {
    targets: Platform.LINUX.createTarget(DIR_TARGET),
    config: {
      asar: false,
      files: [
        "!node_modules/**/*"
      ]
    }
  }, {
    installDepsBefore: true,
    projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
      //noinspection SpellCheckingInspection
      data.dependencies = {
        "is-ci": "*",
      }
    }),
    packed: context => {
      return assertThat(path.join(context.getResources(Platform.LINUX), "app", "node_modules")).doesNotExist()
    }
  })
})