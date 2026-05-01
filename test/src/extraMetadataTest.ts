<<<<<<< HEAD
import { readAsarJson } from "app-builder-lib/internal"
import { Platform } from "electron-builder"
import { coerceTypes, configureBuildCommand, createYargs, normalizeOptions } from "electron-builder/src/builder"
import fsExtra from "fs-extra"
=======
import { readAsarJson } from "app-builder-lib"
import { Platform } from "electron-builder"
import { coerceTypes } from "electron-builder"
<<<<<<< HEAD
import { readJson } from "fs-extra"
>>>>>>> fb7cff668 (esm complete on tests as well?)
=======
import * as fsExtra from "fs-extra"
>>>>>>> 8a2e4e97f (tmp save. migrating fs-extra to namespace import)
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
          expect(await fsExtra.readJson(path.join(context.getResources(Platform.LINUX), "app", "package.json"))).toMatchSnapshot()
        }
      },
    }
  )
}

test("extra metadata", ({ expect }) => createExtraMetadataTest(expect, true))
test("extra metadata (no asar)", ({ expect }) => createExtraMetadataTest(expect, false))

test("cli", ({ expect }) => {
<<<<<<< HEAD
  const yargs = createYargs()
=======
  // because these methods are internal
  const { configureBuildCommand, normalizeOptions } = require("electron-builder")
  const yargs = require("yargs")
>>>>>>> fb7cff668 (esm complete on tests as well?)
    .strict()
    .fail((message: string, error: Error | null) => {
      throw error || new Error(message)
    })
  configureBuildCommand(yargs)

  function parse(input: string): any {
    return normalizeOptions(yargs.parse(input.split(" ")) as any)
  }

  function parseExtraMetadata(input: string) {
    const result = parse(input)
    delete result.targets
    return result
  }

  expect(parseExtraMetadata("--c.extraMetadata.foo=bar")).toMatchSnapshot()
  expect(parseExtraMetadata("--c.extraMetadata.dev.login-url")).toMatchSnapshot()
})
