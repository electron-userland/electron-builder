import { DIR_TARGET, Platform } from "electron-builder"
import { readAsarJson } from "app-builder-lib/out/asar/asar"
import { coerceTypes } from "electron-builder/out/builder"
import { readJson } from "fs-extra"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert"
import { app, modifyPackageJson } from "./helpers/packTester"

function createExtraMetadataTest(asar: boolean) {
  return app({
    targets: Platform.LINUX.createTarget(DIR_TARGET),
    config: coerceTypes({
      asar,
      linux: {
        executableName: "new-name",
      },
      extraMetadata: {
        version: "1.0.0-beta.19",
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
      data.devDependencies = {foo: "boo"}
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

test("cli", async () => {
  // because these methods are internal
  const { configureBuildCommand, normalizeOptions } = require("electron-builder/out/builder")
  const yargs =
    require("yargs")
      .strict()
      .fail((message: string, error: Error | null) => {
        throw error || new Error(message)
      })
  configureBuildCommand(yargs)

  function parse(input: string): any {
    return normalizeOptions(yargs.parse(input.split(" ")))
  }

  function parseExtraMetadata(input: string) {
    const result = parse(input)
    delete result.targets
    return result
  }

  expect(parseExtraMetadata("--c.extraMetadata.foo=bar")).toMatchSnapshot()
  expect(parseExtraMetadata("--c.extraMetadata.dev.login-url")).toMatchSnapshot()
})