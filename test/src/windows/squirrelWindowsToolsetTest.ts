import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { getSquirrelToolsetPath } from "electron-builder-squirrel-windows/src/toolset"
import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"

describe("getSquirrelToolsetPath", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "eb-squirrel-toolset-test-"))
  })

  afterEach(() => rm(tmpDir, { recursive: true, force: true }).catch(() => {}))

  test("resolves a ToolsetCustom bare directory in place (no download)", async () => {
    // A `file://` directory custom toolset is used as-is — no checksum, no network — so this is the
    // air-gapped / local-bundle path and must resolve without touching the network.
    const result = await getSquirrelToolsetPath({ url: `file://${tmpDir}` }, tmpDir)
    expect(result).toBe(path.resolve(tmpDir))
  })

  test("rejects an invalid ToolsetCustom url", async () => {
    await expect(getSquirrelToolsetPath({ url: "not-a-url" }, tmpDir)).rejects.toThrow(/Invalid custom toolset/)
  })
})
