import { DIR_TARGET, Platform } from "electron-builder"
import { build } from "electron-builder/out/builder"
import { move } from "fs-extra-p"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { app, appThrows } from "./helpers/packTester"

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
