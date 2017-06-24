import { DIR_TARGET, Platform } from "electron-builder"
import { readAsarJson } from "electron-builder/out/asar"
import { coerceTypes } from "electron-builder/out/builder"
import { readJson } from "fs-extra-p"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { app, modifyPackageJson } from "./helpers/packTester"

function createExtraMetadataTest(asar: boolean) {
  return app({
    targets: Platform.LINUX.createTarget(DIR_TARGET),
    config: coerceTypes({
      asar: asar,
      linux: {
        executableName: "new-name",
      },
      extraMetadata: {
        foo: {
          bar: 12,
          updated: "true",
          disabled: "false",
        },
        rootKey: "false",
        rootKeyT: "true",
        rootKeyN: "null",
      },
    }),
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
      if (asar) {
        expect(await readAsarJson(path.join(context.getResources(Platform.LINUX), "app.asar"), "package.json")).toMatchSnapshot()
      }
      else {
        expect(await readJson(path.join(context.getResources(Platform.LINUX), "app", "package.json"))).toMatchSnapshot()
      }
    }
  })
}

test.ifDevOrLinuxCi("extra metadata", createExtraMetadataTest(true))
test.ifDevOrLinuxCi("extra metadata (no asar)", createExtraMetadataTest(false))