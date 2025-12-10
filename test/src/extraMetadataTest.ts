import { readAsarJson } from "app-builder-lib"
import { Platform } from "electron-builder"
import { coerceTypes } from "electron-builder"
import { readJson } from "fs-extra"
import * as path from "path"
import { assertThat } from "./helpers/fileAssert.js"
import { app, linuxDirTarget, modifyPackageJson } from "./helpers/packTester.js"
import { ExpectStatic } from "vitest"

function createExtraMetadataTest(expect: ExpectStatic, asar: boolean) {
  return app(
    expect,
    {
      targets: linuxDirTarget,
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
    },
    {
      projectDirCreated: projectDir =>
        modifyPackageJson(projectDir, data => {
          data.scripts = {}
          data.foo = {
            bar: 42,
            existingProp: 22,
          }
        }),
      packed: async context => {
        await assertThat(expect, path.join(context.getContent(Platform.LINUX), "new-name")).isFile()
        if (asar) {
          expect(await readAsarJson(path.join(context.getResources(Platform.LINUX), "app.asar"), "package.json")).toMatchSnapshot()
        } else {
          expect(await readJson(path.join(context.getResources(Platform.LINUX), "app", "package.json"))).toMatchSnapshot()
        }
      },
    }
  )
}

test("extra metadata", ({ expect }) => createExtraMetadataTest(expect, true))
test("extra metadata (no asar)", ({ expect }) => createExtraMetadataTest(expect, false))

test("cli", ({ expect }) => {
  // because these methods are internal
  const { configureBuildCommand, normalizeOptions } = require("electron-builder/out/builder.js")
  const yargs = require("yargs")
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
