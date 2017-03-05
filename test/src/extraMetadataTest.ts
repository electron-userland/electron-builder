import { DIR_TARGET, Platform } from "electron-builder"
import { readAsarJson } from "electron-builder/out/asar"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { app, appTwo, appTwoThrows, modifyPackageJson } from "./helpers/packTester"

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
    data.scripts = {}
    data.devDependencies = {"foo": "boo"}
    data.foo = {
      bar: 42,
      existingProp: 22,
    }
  }),
  packed: async context => {
    await assertThat(path.join(context.getContent(Platform.LINUX), "new-name")).isFile()
    expect(await readAsarJson(path.join(context.getResources(Platform.LINUX), "app.asar"), "package.json")).toMatchSnapshot()
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

test.ifMac("extra metadata - override icon", appTwoThrows({
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