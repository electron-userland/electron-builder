import { modifyPackageJson, appTwoThrows, app, appTwo } from "./helpers/packTester"
import { Platform, DIR_TARGET } from "out"
import { assertThat } from "./helpers/fileAssert"
import * as path from "path"
import { extractFile } from "asar-electron-builder"

test.ifDevOrLinuxCi("extra metadata", app({
  targets: Platform.LINUX.createTarget(DIR_TARGET),
  extraMetadata: {
    foo: {
      bar: 12,
    },
    build: {
      linux: {
        executableName: "new-name"
      }
    }
  },
}, {
  projectDirCreated: projectDir => modifyPackageJson(projectDir, data => {
    data.foo = {
      bar: 42,
      existingProp: 22,
    }
  }),
  packed: async context => {
    await assertThat(path.join(context.getContent(Platform.LINUX), "new-name")).isFile()
    expect(JSON.parse(extractFile(path.join(context.getResources(Platform.LINUX), "app.asar"), "package.json").toString())).toMatchSnapshot()
  }
}))

test.ifDevOrLinuxCi("extra metadata - two", appTwo({
    targets: Platform.LINUX.createTarget(DIR_TARGET),
    extraMetadata: {
    build: {
      linux: {
        executableName: "new-name"
      }
    }
  },
  }, {
    packed: async context => {
      await assertThat(path.join(context.getContent(Platform.LINUX), "new-name")).isFile()
    }
}))

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