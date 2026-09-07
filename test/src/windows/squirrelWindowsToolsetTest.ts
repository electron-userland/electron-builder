import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Version resolution must never reach the network in a unit test: intercept the shared toolset
// downloader and assert the release descriptor it is asked for. Everything else in electronGet stays real
// (the ToolsetCustom `file://` path below relies on it).
vi.mock("app-builder-lib/src/util/electronGet", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/util/electronGet")>()
  return { ...actual, downloadBuilderToolset: vi.fn() }
})

import { downloadBuilderToolset } from "app-builder-lib/internal"
import { getSquirrelToolsetPath, squirrelWindowsChecksums } from "electron-builder-squirrel-windows/src/toolset"
import { mkdtemp, rm } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"

describe("getSquirrelToolsetPath", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "eb-squirrel-toolset-test-"))
    vi.mocked(downloadBuilderToolset).mockReset()
    vi.mocked(downloadBuilderToolset).mockResolvedValue("/fake/squirrel-toolset")
  })

  afterEach(() => rm(tmpDir, { recursive: true, force: true }).catch(() => {}))

  test("resolves a ToolsetCustom bare directory in place (no download)", async () => {
    // A `file://` directory custom toolset is used as-is — no checksum, no network — so this is the
    // air-gapped / local-bundle path and must resolve without touching the network.
    const result = await getSquirrelToolsetPath({ url: `file://${tmpDir}` }, tmpDir)
    expect(result).toBe(path.resolve(tmpDir))
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test("rejects an invalid ToolsetCustom url", async () => {
    await expect(getSquirrelToolsetPath({ url: "not-a-url" }, tmpDir)).rejects.toThrow(/Invalid custom toolset/)
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  const pinnedDescriptor = {
    releaseName: "squirrel.windows@1.1.1",
    filenameWithExt: "squirrel.windows-2.0.1-patched.zip",
    checksums: squirrelWindowsChecksums["1.1.1"],
  }

  test('pinned "1.1.1" downloads the maintained bundle with its checksum', async () => {
    const result = await getSquirrelToolsetPath("1.1.1", tmpDir)
    expect(result).toBe("/fake/squirrel-toolset")
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith(pinnedDescriptor)
    expect(pinnedDescriptor.checksums["squirrel.windows-2.0.1-patched.zip"]).toMatch(/^[0-9a-f]{64}$/)
  })

  test.each([
    ["latest", "latest"],
    ["undefined", undefined],
    ["null", null],
  ])("%s resolves to the newest bundle (1.1.1)", async (_label, toolset) => {
    await getSquirrelToolsetPath(toolset as any, tmpDir)
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith(pinnedDescriptor)
  })

  test("an unknown pinned version is forwarded to the downloader without a checksum", async () => {
    // There is no local allow-list: resolution only maps the sentinel, so an unknown version reaches
    // downloadBuilderToolset (which then fails on the missing release / disabled checksum).
    await getSquirrelToolsetPath("9.9.9" as any, tmpDir)
    expect(downloadBuilderToolset).toHaveBeenCalledWith({
      releaseName: "squirrel.windows@9.9.9",
      filenameWithExt: "squirrel.windows-2.0.1-patched.zip",
      checksums: undefined,
    })
  })

  test("download failures propagate", async () => {
    vi.mocked(downloadBuilderToolset).mockRejectedValueOnce(new Error("network error"))
    await expect(getSquirrelToolsetPath("1.1.1", tmpDir)).rejects.toThrow("network error")
  })
})
