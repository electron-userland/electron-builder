import { shouldWriteEffectiveConfig } from "app-builder-lib/src/packager"
import fsExtra from "fs-extra"
import * as path from "path"
import { describe, test } from "vitest"
import { app, linuxDirTarget } from "./helpers/packTester.js"

describe("shouldWriteEffectiveConfig", () => {
  test("defaults to local interactive builds only", ({ expect }) => {
    expect(shouldWriteEffectiveConfig(undefined, false, true)).toBe(true)
    expect(shouldWriteEffectiveConfig(null, false, true)).toBe(true)
    expect(shouldWriteEffectiveConfig(undefined, true, true)).toBe(false)
    expect(shouldWriteEffectiveConfig(undefined, false, false)).toBe(false)
  })

  test("explicit option wins over CI and TTY detection", ({ expect }) => {
    expect(shouldWriteEffectiveConfig(true, true, false)).toBe(true)
    expect(shouldWriteEffectiveConfig(false, false, true)).toBe(false)
  })
})

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
