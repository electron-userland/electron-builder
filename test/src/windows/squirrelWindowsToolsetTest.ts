import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { getSquirrelToolsetPath } from "electron-builder-squirrel-windows/src/toolset"
import { mkdtemp, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"

const ENV_KEY = "ELECTRON_BUILDER_SQUIRREL_TOOLSET_DIR"

describe("getSquirrelToolsetPath", () => {
  let savedEnv: string | undefined
  let tmpDir: string

  beforeEach(async () => {
    savedEnv = process.env[ENV_KEY]
    tmpDir = await mkdtemp(path.join(tmpdir(), "eb-squirrel-toolset-test-"))
  })

  afterEach(async () => {
    if (savedEnv === undefined) {
      delete process.env[ENV_KEY]
    } else {
      process.env[ENV_KEY] = savedEnv
    }
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  })

  test("returns env var path when set to an existing directory", async () => {
    process.env[ENV_KEY] = tmpDir
    const result = await getSquirrelToolsetPath()
    expect(result).toBe(tmpDir)
  })

  test("throws when env var points to a non-existent path", async () => {
    process.env[ENV_KEY] = path.join(tmpDir, "does-not-exist")
    await expect(getSquirrelToolsetPath()).rejects.toThrow(ENV_KEY)
  })

  test("throws when env var points to a file instead of a directory", async () => {
    const filePath = path.join(tmpDir, "not-a-dir.txt")
    await writeFile(filePath, "")
    process.env[ENV_KEY] = filePath
    await expect(getSquirrelToolsetPath()).rejects.toThrow(ENV_KEY)
  })

  test("throws when env var is a relative path", async () => {
    process.env[ENV_KEY] = "relative/path"
    await expect(getSquirrelToolsetPath()).rejects.toThrow(ENV_KEY)
  })
})
