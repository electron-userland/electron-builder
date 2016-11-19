import { assertPack, modifyPackageJson, appTwoThrows } from "./helpers/packTester"
import { Platform, DIR_TARGET } from "out"
import { assertThat } from "./helpers/fileAssert"
import * as path from "path"
import { extractFile } from "asar-electron-builder"

test.ifDevOrLinuxCi("extra metadata", () => {
  const extraMetadata = {
    foo: {
      bar: 12,
    },
    build: {
      linux: {
        executableName: "new-name"
      }
    }
  }
  return assertPack("test-app-one", {
    targets: Platform.LINUX.createTarget(DIR_TARGET),
    extraMetadata: extraMetadata,
  }, {
    projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
      data.foo = {
        bar: 42,
        existingProp: 22,
      }
    }),
    packed: async context => {
      await assertThat(path.join(context.getContent(Platform.LINUX), "new-name")).isFile()
      assertThat(JSON.parse(extractFile(path.join(context.getResources(Platform.LINUX), "app.asar"), "package.json").toString())).hasProperties({
        foo: {
          bar: 12,
          existingProp: 22,
        }
      })
    }
  })
})

test.ifDevOrLinuxCi("extra metadata - two", () => {
  const extraMetadata = {
    build: {
      linux: {
        executableName: "new-name"
      }
    }
  }
  return assertPack("test-app", {
    targets: Platform.LINUX.createTarget(DIR_TARGET),
    extraMetadata: extraMetadata,
  }, {
    packed: async context => {
      await assertThat(path.join(context.getContent(Platform.LINUX), "new-name")).isFile()
    }
  })
})

test.ifMac("extra metadata - override icon", appTwoThrows(/ENOENT: no such file or directory/, {
  targets: Platform.MAC.createTarget(DIR_TARGET),
  extraMetadata: {
    build: {
      mac: {
        icon: "dev"
      }
    },
  },
}, {
  packed: async context => {
    await assertThat(path.join(context.getContent(Platform.LINUX), "new-name")).isFile()
  }
}))