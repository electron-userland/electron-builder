import fsExtra from "fs-extra"
import * as path from "path"
import { test } from "vitest"
import { app, linuxDirTarget } from "./helpers/packTester.js"

const effectiveConfigFile = (outDir: string) => path.join(outDir, "builder-effective-config.yaml")

test("writeEffectiveConfig: true writes the file outside a TTY", ({ expect }) =>
  app(
    expect,
    { targets: linuxDirTarget, config: { writeEffectiveConfig: true } },
    {
      packed: async context => {
        const content = await fsExtra.readFile(effectiveConfigFile(context.outDir), "utf8")
        expect(content).toMatch(/^electronVersion: /m)
      },
    }
  ))

test("writeEffectiveConfig: false skips the file", ({ expect }) =>
  app(
    expect,
    { targets: linuxDirTarget, config: { writeEffectiveConfig: false } },
    {
      packed: async context => {
        expect(await fsExtra.pathExists(effectiveConfigFile(context.outDir))).toBe(false)
      },
    }
  ))
