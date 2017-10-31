import { Arch, build, DIR_TARGET, Platform } from "electron-builder"
import { move } from "fs-extra-p"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { app, assertPack, linuxDirTarget, modifyPackageJson } from "./helpers/packTester"
import { expectUpdateMetadata } from "./helpers/winHelper"

function createBuildResourcesTest(platform: Platform) {
  return app({
    // only dir - avoid DMG
    targets: platform.createTarget(platform === Platform.MAC ? DIR_TARGET : null),
    config: {
      publish: null,
      directories: {
        buildResources: "custom",
        output: "customDist",
        // https://github.com/electron-userland/electron-builder/issues/601
        app: ".",
      }
    },
  }, {
    packed: async context => {
      await assertThat(path.join(context.projectDir, "customDist")).isDirectory()
    },
    projectDirCreated: projectDir => move(path.join(projectDir, "build"), path.join(projectDir, "custom"))
  })
}

test.ifAll.ifNotWindows("custom buildResources and output dirs: mac", createBuildResourcesTest(Platform.MAC))
test.ifAll.ifNotCiMac("custom buildResources and output dirs: win", createBuildResourcesTest(Platform.WINDOWS))
test.ifAll.ifNotWindows("custom buildResources and output dirs: linux", createBuildResourcesTest(Platform.LINUX))

test.ifAll.ifLinuxOrDevMac("prepackaged", app({
  targets: linuxDirTarget,
}, {
  packed: async context => {
    await build({
      prepackaged: path.join(context.outDir, "linux-unpacked"),
      project: context.projectDir,
      linux: [],
      config: {
        // test target
        linux: {
          target: {
            target: "deb",
            arch: "ia32",
          }
        },
        compression: "store"
      }
    })
    await assertThat(path.join(context.projectDir, "dist", "TestApp_1.1.0_i386.deb")).isFile()
  }
}))

test.ifAll.ifLinuxOrDevMac("retrieve latest electron version", app({
  targets: linuxDirTarget,
}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    delete data.build.electronVersion
  }),
}))

test.ifAll.ifDevOrLinuxCi("override targets in the config", app({
  targets: linuxDirTarget,
}, {
  packed: async context => {
    await build({
      projectDir: context.projectDir,
      linux: ["deb"],
      config: {
        publish: null,
        // https://github.com/electron-userland/electron-builder/issues/1355
        linux: {
          target: [
            "AppImage",
            "deb",
            "rpm"
          ],
        },
        compression: "store"
      }
    })
  }
}))

// test https://github.com/electron-userland/electron-builder/issues/1182 also
test.ifAll.ifDevOrWinCi("override targets in the config - only arch", app({
  targets: Platform.WINDOWS.createTarget(null, Arch.ia32),
  config: {
    extraMetadata: {
      version: "1.0.0-beta.1",
    },
    // https://github.com/electron-userland/electron-builder/issues/1348
    win: {
      // tslint:disable:no-invalid-template-strings
      artifactName: "${channel}-${name}.exe",
      target: [
        "nsis",
      ],
    },
    publish: {
      provider: "generic",
      url: "https://develar.s3.amazonaws.com/test",
    },
  },
}, {
  packed: async context => {
    await assertThat(path.join(context.projectDir, "dist", "win-unpacked")).doesNotExist()
    await assertThat(path.join(context.projectDir, "dist", "latest.yml")).doesNotExist()
    await expectUpdateMetadata(context, Arch.ia32)
  },
}))

// test on all CI to check path separators
test.ifAll("do not exclude build entirely (respect files)", () => assertPack("test-app-build-sub", {targets: linuxDirTarget}))

test.ifAll("electronDist as path to local folder with electron builds zipped ", app({
  targets: linuxDirTarget,
  config: {
    electronDist: require("env-paths")("electron", {suffix: ""}).cache,
  },
}))

const overridePublishChannel: any = {
  channel: "beta"
}

test.ifAll.ifDevOrLinuxCi("overriding the publish channel", app({
  targets: linuxDirTarget,
  config: {
    publish: overridePublishChannel
  },
}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.devDependencies = {}
    data.build.publish = [
      {
        provider: "s3",
        bucket: "my-s3-bucket",
      }
    ]
  }),
  packed: async context => {
    expect(context.packager.config.publish).toMatchSnapshot()
  },
}))