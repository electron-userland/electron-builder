import { Arch, DIR_TARGET, Platform } from "electron-builder"
import { build } from "electron-builder/out/builder"
import { move, readFile } from "fs-extra-p"
import { safeLoad } from "js-yaml"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { app, appThrows, assertPack } from "./helpers/packTester"
import { expectUpdateMetadata } from "./helpers/winHelper"

function createBuildResourcesTest(platform: Platform) {
  return app({
    // only dir - avoid DMG
    targets: platform.createTarget(platform === Platform.MAC ? DIR_TARGET : null),
    config: {
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

const linuxDirTarget = Platform.LINUX.createTarget(DIR_TARGET)

test.ifAll.ifNotWindows("custom buildResources and output dirs: mac", createBuildResourcesTest(Platform.MAC))
test.ifAll.ifNotCiMac("custom buildResources and output dirs: win", createBuildResourcesTest(Platform.WINDOWS))
test.ifAll.ifNotWindows("custom buildResources and output dirs: linux", createBuildResourcesTest(Platform.LINUX))

test.ifAll.ifLinuxOrDevMac("prepackaged", app({
  targets: linuxDirTarget,
}, {
  packed: async (context) => {
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

test.ifAll.ifDevOrLinuxCi("override targets in the config", app({
  targets: linuxDirTarget,
}, {
  packed: async (context) => {
    await build({
      projectDir: context.projectDir,
      linux: ["deb"],
      config: {
        publish: null,
        // https://github.com/electron-userland/electron-builder/issues/1355
        linux: {
          "target": [
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
  appMetadata: {
    version: "1.0.0-beta.1",
  },
  config: {
    // https://github.com/electron-userland/electron-builder/issues/1348
    win: {
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
  packed: async (context) => {
    await assertThat(path.join(context.projectDir, "dist", "win-unpacked")).doesNotExist()
    await assertThat(path.join(context.projectDir, "dist", "latest.yml")).doesNotExist()
    await expectUpdateMetadata(context, Arch.ia32)

    const updateInfo = safeLoad(await readFile(path.join(context.outDir, "beta.yml"), "utf-8"))
    expect(updateInfo.sha2).not.toEqual("")
    expect(updateInfo.releaseDate).not.toEqual("")
    delete updateInfo.sha2
    delete updateInfo.releaseDate
    expect(updateInfo).toMatchSnapshot()
  },
}))

test.ifAll.ifDevOrLinuxCi("scheme validation", appThrows({
  targets: linuxDirTarget,
  config: <any>{
    foo: 123,
    mac: {
      foo: 12123,
    },
  },
}))

test.ifAll.ifDevOrLinuxCi("scheme validation 2", appThrows({
  targets: linuxDirTarget,
  config: <any>{
    appId: 123,
  },
}))

// https://github.com/electron-userland/electron-builder/issues/1302
test.ifAll.ifDevOrLinuxCi("scheme validation extraFiles", app({
  targets: Platform.LINUX.createTarget([]),
  config: {
    linux: {
      target: "zip:ia32",
    },
    "extraFiles": [
      "lib/*.jar",
      "lib/Proguard/**/*",
      {
        "from": "lib/",
        "to": ".",
        "filter": [
          "*.dll"
        ]
      },
      {
        "from": "lib/",
        "to": ".",
        "filter": [
          "*.exe"
        ]
      },
      "BLClient/BLClient.json",
      {
        "from": "include/",
        "to": "."
      }
    ],
  },
}))

// test on all CI to check path separators
test.ifAll("do not exclude build entirely (respect files)", () => assertPack("test-app-build-sub", {targets: linuxDirTarget}))