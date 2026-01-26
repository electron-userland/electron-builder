import { downloadArtifact } from "app-builder-lib/src/util/electronGet"
import { Arch, build, PackagerOptions, Platform } from "electron-builder"
import * as fs from "fs"
import { readdir } from "fs/promises"
import * as path from "path"
import { TmpDir } from "temp-file"
import * as unzipper from "unzipper"
import { ExpectStatic } from "vitest"
import { assertThat } from "./helpers/fileAssert"
import { app, assertPack, linuxDirTarget, modifyPackageJson } from "./helpers/packTester"
import { ELECTRON_VERSION } from "./helpers/testConfig"
import { expectUpdateMetadata } from "./helpers/winHelper"

function createBuildResourcesTest(expect: ExpectStatic, packagerOptions: PackagerOptions) {
  return app(
    expect,
    {
      ...packagerOptions,
      config: {
        publish: null,
        directories: {
          buildResources: "custom",
          // tslint:disable:no-invalid-template-strings
          output: "customDist/${channel}",
          // https://github.com/electron-userland/electron-builder/issues/601
          app: ".",
        },
        win: {
          signAndEditExecutable: false,
        },
        nsis: {
          differentialPackage: false,
        },
      },
    },
    {
      packed: async context => {
        await assertThat(expect, path.join(context.projectDir, "customDist", "latest")).isDirectory()
      },
      projectDirCreated: projectDir => Promise.resolve(fs.renameSync(path.join(projectDir, "build"), path.join(projectDir, "custom"))),
    }
  )
}

test.ifNotWindows("custom buildResources and output dirs: mac", ({ expect }) => createBuildResourcesTest(expect, { mac: ["dir"] }))
test.ifNotCiMac("custom buildResources and output dirs: win", ({ expect }) => createBuildResourcesTest(expect, { win: ["nsis"] }))
test.ifNotWindows("custom buildResources and output dirs: linux", ({ expect }) => createBuildResourcesTest(expect, { linux: ["appimage"] }))

test.ifLinuxOrDevMac("prepackaged", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
    },
    {
      packed: async context => {
        await build({
          prepackaged: path.join(context.outDir, "linux-unpacked"),
          projectDir: context.projectDir,
          linux: [],
          config: {
            // test target
            linux: {
              target: {
                target: "deb",
                arch: "ia32",
              },
            },
            compression: "store",
          },
        })
        await assertThat(expect, path.join(context.projectDir, "dist", "TestApp_1.1.0_i386.deb")).isFile()
      },
    }
  )
)

test.ifLinuxOrDevMac("retrieve latest electron version", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
    },
    {
      projectDirCreated: projectDir =>
        modifyPackageJson(projectDir, data => {
          data.devDependencies = {
            ...data.devDependencies,
            electron: "latest",
          }
          delete data.build.electronVersion
        }),
    }
  )
)

test.ifLinuxOrDevMac("retrieve latest electron-nightly version", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
    },
    {
      projectDirCreated: projectDir =>
        modifyPackageJson(projectDir, data => {
          data.devDependencies = {
            ...data.devDependencies,
            "electron-nightly": "latest",
          }
          delete data.build.electronVersion
        }),
    }
  )
)

test.ifNotWindows("override targets in the config", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
    },
    {
      packed: async context => {
        await build({
          projectDir: context.projectDir,
          linux: ["deb"],
          config: {
            publish: null,
            // https://github.com/electron-userland/electron-builder/issues/1355
            linux: {
              target: ["AppImage", "deb", "rpm", "pacman"],
            },
            compression: "store",
          },
        })
      },
    }
  )
)

// test https://github.com/electron-userland/electron-builder/issues/1182 also
test.ifDevOrWinCi("override targets in the config - only arch", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.WINDOWS.createTarget(null, Arch.ia32),
      config: {
        extraMetadata: {
          version: "1.0.0-beta.1",
        },
        // https://github.com/electron-userland/electron-builder/issues/1348
        win: {
          // tslint:disable:no-invalid-template-strings
          artifactName: "${channel}-${name}.exe",
          target: ["nsis"],
        },
        publish: {
          provider: "generic",
          url: "https://develar.s3.amazonaws.com/test",
        },
      },
    },
    {
      packed: context => {
        return Promise.all([
          assertThat(expect, path.join(context.projectDir, "dist", "win-unpacked")).doesNotExist(),
          assertThat(expect, path.join(context.projectDir, "dist", "latest.yml")).doesNotExist(),
          expectUpdateMetadata(expect, context, Arch.ia32),
        ])
      },
    }
  )
)

// test on all CI to check path separators
test("do not exclude build entirely (respect files)", ({ expect }) => assertPack(expect, "test-app-build-sub", { targets: linuxDirTarget }))

test.ifNotWindows("electronDist as path to local folder with electron builds zipped ", async ({ expect }) => {
  const tmpDir = new TmpDir()
  const cacheDir = await tmpDir.createTempDir({ prefix: "electronDistCache" })
  const file = await downloadArtifact(
    {
      artifactName: "electron",
      platformName: Platform.LINUX.nodeName,
      arch: "x64",
      version: ELECTRON_VERSION,
      cacheDir,
    },
    null
  )
  await app(
    expect,
    {
      targets: Platform.LINUX.createTarget("dir", Arch.x64),
      config: {
        electronDist: path.dirname(file),
      },
    },
    {
      tmpDir,
    }
  )
  await tmpDir.cleanup()
})

test.ifNotWindows("electronDist as callback function for path to local electron zipped artifact ", async ({ expect }) => {
  await app(expect, {
    targets: linuxDirTarget,
    config: {
      electronDist: async context => {
        const { platformName, arch, version, packager } = context

        const cacheDir = await packager.info.tempDirManager.createTempDir({ prefix: "electronDistCache" })
        const file = await downloadArtifact(
          {
            artifactName: "electron",
            platformName,
            arch,
            version,
            cacheDir,
          },
          null
        )
        return file
      },
    },
  })
})

test.ifLinux("electronDist as standard path to node_modules electron", ({ expect }) => {
  return app(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        electronDist: "node_modules/electron/dist",
      },
    },
    {
      projectDirCreated: async projectDir => {
        await modifyPackageJson(projectDir, data => {
          data.devDependencies = {
            ...data.devDependencies,
            electron: ELECTRON_VERSION,
          }
          delete data.build.electronVersion
        })
      },
      packed: async context => {
        const contents = await readdir(context.getAppPath(Platform.LINUX, Arch.x64))
        expect(contents).toMatchSnapshot()
      },
    }
  )
})

test.ifNotWindows("electronDist as callback function for path to locally unzipped", ({ expect }) => {
  const tmpDir = new TmpDir()

  return app(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        electronDist: async context => {
          const { platformName, arch, version } = context
          const fileName = `electron-v${version}-${platformName}-${arch}.zip`
          const electronUrl = `https://github.com/electron/electron/releases/download/v${version}/${fileName}`

          const tempDir = await tmpDir.getTempDir()
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir)
          }
          const electronPath = path.join(tempDir, "electron-dist")

          const directory = await unzipper.Open.url(require("request"), electronUrl)
          await directory.extract({ path: electronPath, concurrency: 5, forceStream: true })

          return electronPath
        },
      },
    },
    {
      packed: async context => {
        const contents = await readdir(context.getAppPath(Platform.LINUX, Arch.x64))
        expect(contents).toMatchSnapshot()
        await tmpDir.cleanup()
      },
    }
  )
})

const overridePublishChannel: any = {
  channel: "beta",
}

test.ifDevOrLinuxCi("overriding the publish channel", ({ expect }) =>
  app(
    expect,
    {
      targets: linuxDirTarget,
      config: {
        publish: overridePublishChannel,
      },
    },
    {
      projectDirCreated: projectDir =>
        modifyPackageJson(projectDir, data => {
          data.devDependencies = {}
          data.build.publish = [
            {
              provider: "s3",
              bucket: "my-s3-bucket",
            },
          ]
        }),
      packed: async context => {
        expect(context.packager.config.publish).toMatchSnapshot()
        return Promise.resolve()
      },
    }
  )
)
