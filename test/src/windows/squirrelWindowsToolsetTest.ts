import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { getSquirrelToolsetPath, prepareNugetExe } from "electron-builder-squirrel-windows/src/toolset"
import { mkdtemp, rm, stat, writeFile } from "fs/promises"
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

describe("prepareNugetExe", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "eb-squirrel-nuget-test-"))
  })

  afterEach(() => rm(tmpDir, { recursive: true, force: true }).catch(() => {}))

  test("keeps an already-usable nuget.exe and performs no download", async () => {
    // A real nuget.exe is several MB; staging one larger than the shim threshold must short-circuit
    // the download entirely (this is the offline / custom-bundle path, so it must not hit network).
    const nugetExe = path.join(tmpDir, "nuget.exe")
    await writeFile(nugetExe, Buffer.alloc(2_100_000, 1))
    const before = await stat(nugetExe)

    await prepareNugetExe(tmpDir)

    const after = await stat(nugetExe)
    expect(after.size).toBe(before.size)
    expect(after.mtimeMs).toBe(before.mtimeMs)
  })
})
