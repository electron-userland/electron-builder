import { Platform } from "app-builder-lib"
import { readAsar } from "app-builder-lib"
import { PM } from "app-builder-lib"
import { outputFile } from "fs-extra"
import * as fs from "fs/promises"
import * as path from "path"
import { ExpectStatic } from "vitest"
import { assertThat } from "./helpers/fileAssert.js"
import { app, appThrows, assertPack, linuxDirTarget, modifyPackageJson, PackedContext, removeUnstableProperties, verifyAsarFileTree } from "./helpers/packTester.js"
import { verifySmartUnpack } from "./helpers/verifySmartUnpack.js"

async function createFiles(appDir: string) {
  await Promise.all([
    outputFile(path.join(appDir, "assets", "file1"), "data"),
    outputFile(path.join(appDir, "assets", "file2"), "data"),
    outputFile(path.join(appDir, "assets", "subdir", "file3"), "data"),
    outputFile(path.join(appDir, "b2", "file"), "data"),
    outputFile(path.join(appDir, "do-not-unpack-dir", "file.json"), "{}").then(() => fs.writeFile(path.join(appDir, "do-not-unpack-dir", "must-be-not-unpacked"), "{}")),
  ])

  const dir = path.join(appDir, "do-not-unpack-dir", "dir-2", "dir-3", "dir-3")
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, "file-in-asar"), "{}")

  await fs.symlink(path.join(appDir, "assets", "file1"), path.join(appDir, "assets", "subdir", "file-symlink1")) // "reverse" symlink up one directory
  await fs.symlink(path.join(appDir, "assets", "file2"), path.join(appDir, "assets", "file-symlink2")) // same dir symlink
  await fs.symlink(path.join(appDir, "assets", "subdir", "file3"), path.join(appDir, "file-symlink3")) // symlink down
}

test.ifNotWindows.ifDevOrLinuxCi("unpackDir one", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        asarUnpack: ["assets", "b2", "do-not-unpack-dir/file.json"],
      },
    },
    {
      projectDirCreated: createFiles,
      packed: context => assertDirs(expect, context),
    }
  )
)

async function assertDirs(expect: ExpectStatic, context: PackedContext) {
  const resourceDir = context.getResources(Platform.LINUX)
  await Promise.all([
    assertThat(expect, path.join(resourceDir, "app.asar.unpacked", "assets")).isDirectory(),
    assertThat(expect, path.join(resourceDir, "app.asar.unpacked", "b2")).isDirectory(),
    assertThat(expect, path.join(resourceDir, "app.asar.unpacked", "do-not-unpack-dir", "file.json")).isFile(),
    assertThat(expect, path.join(resourceDir, "app.asar.unpacked", "do-not-unpack-dir", "must-be-not-unpacked")).doesNotExist(),
    assertThat(expect, path.join(resourceDir, "app.asar.unpacked", "do-not-unpack-dir", "dir-2")).doesNotExist(),
  ])

  await verifyAsarFileTree(expect, resourceDir)
}

test.ifNotWindows.ifDevOrLinuxCi("unpackDir", ({ expect }) => {
  return assertPack(
    expect,
    "test-app",
    {
      targets: linuxDirTarget,
      config: {
        asarUnpack: ["assets", "b2", "do-not-unpack-dir/file.json"],
      },
    },
    {
      projectDirCreated: projectDir => createFiles(path.join(projectDir, "app")),
      packed: context => assertDirs(expect, context),
    }
  )
})

test.ifDevOrLinuxCi("asarUnpack and files ignore", ({ expect }) => {
  return assertPack(
    expect,
    "test-app",
    {
      targets: linuxDirTarget,
      config: {
        asarUnpack: ["!**/ffprobe-static/bin/darwin/x64/ffprobe"],
      },
    },
    {
      projectDirCreated: projectDir => outputFile(path.join(projectDir, "test/ffprobe-static/bin/darwin/x64/ffprobe"), "data"),
      packed: async context => {
        const resourceDir = context.getResources(Platform.LINUX)
        await Promise.all([assertThat(expect, path.join(resourceDir, "app.asar.unpacked", "test/ffprobe-static/bin/darwin/x64/ffprobe")).doesNotExist()])

        await verifyAsarFileTree(expect, resourceDir)
      },
    }
  )
})

test.ifNotWindows("link", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
    },
    {
      projectDirCreated: projectDir => {
        return fs.symlink(path.join(projectDir, "index.js"), path.join(projectDir, "foo.js"))
      },
      packed: async context => {
        const resources = context.getResources(Platform.LINUX)
        expect((await readAsar(path.join(resources, "app.asar"))).getFile("foo.js", false)).toMatchSnapshot()
        await verifyAsarFileTree(expect, resources)
      },
    }
  )
)

test.skip("outside link", ({ expect }) =>
  appThrows(
    expect,
    {
      targets: linuxDirTarget,
    },
    {
      projectDirCreated: async (projectDir, tmpDir) => {
        const tempDir = await tmpDir.getTempDir()
        await outputFile(path.join(tempDir, "foo"), "data")
        await fs.symlink(tempDir, path.join(projectDir, "o-dir"))
      },
    },
    error => {
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toContain("outside the package to a system or unsafe path")
    }
  ))
test.ifNotWindows("symlinks everywhere with static framework", ({ expect }) =>
  assertPack(
    expect,
    "test-app-symlink-framework",
    {
      targets: linuxDirTarget,
      config: {
        files: ["!hello-world"],
      },
    },
    {
      packageManager: PM.NPM,
      projectDirCreated: async projectDir => {
        await modifyPackageJson(projectDir, data => {
          data.dependencies = {
            debug: "4.1.1",
            ...data.dependencies,
          }
        })
        await fs.symlink(path.join(projectDir, "index.js"), path.join(projectDir, "foo.js"))
      },
      packed: async context => {
        const resources = context.getResources(Platform.LINUX)
        expect((await readAsar(path.join(resources, "app.asar"))).getFile("foo.js", false)).toMatchSnapshot()
        await verifySmartUnpack(expect, resources)
      },
    }
  )
)

// https://github.com/electron-userland/electron-builder/issues/611
test.ifDevOrLinuxCi("failed peer dep", ({ expect }) => {
  return assertPack(
    expect,
    "test-app-one",
    {
      targets: linuxDirTarget,
    },
    {
      packageManager: PM.YARN,
      projectDirCreated: async projectDir => {
        return Promise.all([
          modifyPackageJson(projectDir, data => {
            //noinspection SpellCheckingInspection
            data.dependencies = {
              debug: "4.1.1",
              "rc-datepicker": "4.0.0",
              react: "15.2.1",
              "react-dom": "15.2.1",
            }
          }),
        ])
      },
      packed: context => {
        return verifySmartUnpack(expect, context.getResources(Platform.LINUX))
      },
    }
  )
})

test.ifDevOrLinuxCi("ignore node_modules", ({ expect }) => {
  return assertPack(
    expect,
    "test-app-one",
    {
      targets: linuxDirTarget,
      config: {
        asar: false,
        files: ["!node_modules/**/*"],
      },
    },
    {
      packageManager: PM.NPM,
      projectDirCreated: async projectDir => {
        return modifyPackageJson(projectDir, data => {
          //noinspection SpellCheckingInspection
          data.dependencies = {
            "ci-info": "2.0.0",
            // this contains string-width-cjs 4.2.3
            "@isaacs/cliui": "8.0.2",
          }
        })
      },
      packed: context => {
        return assertThat(expect, path.join(context.getResources(Platform.LINUX), "app", "node_modules")).doesNotExist()
      },
    }
  )
})

test.ifDevOrLinuxCi("asarUnpack node_modules", ({ expect }) => {
  return assertPack(
    expect,
    "test-app-one",
    {
      targets: linuxDirTarget,
      config: {
        asarUnpack: "node_modules",
      },
    },
    {
      packageManager: PM.NPM,
      projectDirCreated: async projectDir => {
        return modifyPackageJson(projectDir, data => {
          data.dependencies = {
            "ci-info": "2.0.0",
          }
        })
      },
      packed: async context => {
        const nodeModulesNode = (await readAsar(path.join(context.getResources(Platform.LINUX), "app.asar"))).getNode("node_modules")
        expect(removeUnstableProperties(nodeModulesNode)).toMatchSnapshot()
        await assertThat(expect, path.join(context.getResources(Platform.LINUX), "app.asar.unpacked/node_modules/ci-info")).isDirectory()
      },
    }
  )
})
