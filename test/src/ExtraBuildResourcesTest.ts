import { Arch, build, PackagerOptions, Platform } from "electron-builder"
import * as fs from "fs/promises"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { app, assertPack, linuxDirTarget, modifyPackageJson } from "./helpers/packTester"
import { getElectronCacheDir } from "./helpers/testConfig"
import { expectUpdateMetadata } from "./helpers/winHelper"
import { ExpectStatic } from "vitest"

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
      projectDirCreated: projectDir => fs.rename(path.join(projectDir, "build"), path.join(projectDir, "custom")),
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

test.ifNotWindows("electronDist as path to local folder with electron builds zipped ", ({ expect }) =>
  app(expect, {
    targets: linuxDirTarget,
    config: {
      electronDist: getElectronCacheDir(),
    },
  })
)

test.ifNotWindows("electronDist as callback function for path to local folder with electron builds zipped ", ({ expect }) =>
  app(expect, {
    targets: linuxDirTarget,
    config: {
      electronDist: _context => {
        return Promise.resolve(getElectronCacheDir())
      },
    },
  })
)

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
      },
    }
  )
)
