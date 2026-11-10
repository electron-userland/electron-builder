import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// Version resolution must never reach the network in a unit test: intercept the shared toolset
// downloader and assert the release descriptor it is asked for. Everything else in electronGet stays real
// (the ToolsetCustom `file://` path below relies on it).
vi.mock("app-builder-lib/src/util/electronGet", async importOriginal => {
  const actual = await importOriginal<typeof import("app-builder-lib/src/util/electronGet")>()
  return { ...actual, downloadBuilderToolset: vi.fn() }
})

import { downloadBuilderToolset } from "app-builder-lib/internal"
import { InvalidConfigurationError } from "builder-util"
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

  const descriptorFor = (version: keyof typeof squirrelWindowsChecksums) => ({
    releaseName: `squirrel.windows@${version}`,
    filenameWithExt: "squirrel.windows-2.0.1-patched.zip",
    checksums: squirrelWindowsChecksums[version],
  })

  test.each(["1.1.1", "1.2.1"] as const)('pinned "%s" downloads that maintained bundle with its checksum', async version => {
    const result = await getSquirrelToolsetPath(version, tmpDir)
    expect(result).toBe("/fake/squirrel-toolset")
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith(descriptorFor(version))
    expect(squirrelWindowsChecksums[version]["squirrel.windows-2.0.1-patched.zip"]).toMatch(/^[0-9a-f]{64}$/)
  })

  test.each([
    ["latest", "latest"],
    ["undefined", undefined],
    ["null", null],
  ])("%s resolves to the newest bundle (1.2.1)", async (_label, toolset) => {
    await getSquirrelToolsetPath(toolset as any, tmpDir)
    expect(downloadBuilderToolset).toHaveBeenCalledTimes(1)
    expect(downloadBuilderToolset).toHaveBeenCalledWith(descriptorFor("1.2.1"))
  })

  // Making 1.2.1 the default must stay additive: the earlier pin keeps its own release and checksum.
  test("1.2.1 is added alongside the earlier pin, which keeps its checksum", () => {
    expect(Object.keys(squirrelWindowsChecksums)).toEqual(["1.1.1", "1.2.1"])
    expect(squirrelWindowsChecksums["1.2.1"]).toEqual({
      "squirrel.windows-2.0.1-patched.zip": "ff65e7383b20cc9224cc5e96b725b21115f0e99400943507e3aef79f64da2020",
    })
    expect(squirrelWindowsChecksums["1.1.1"]).toEqual({
      "squirrel.windows-2.0.1-patched.zip": "77cc2c451639c3b0bd68fde67111f726a236e6750d15f521c79e606fd7119e72",
    })
  })

  test("an unknown pinned version is rejected before any download", async () => {
    // Without a checksum entry the downloader would run with integrity verification disabled, so an
    // unknown version (only reachable through a programmatic / unvalidated config) must fail fast.
    const promise = getSquirrelToolsetPath("9.9.9" as any, tmpDir)
    await expect(promise).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(promise).rejects.toThrow(/Unknown toolsets\.squirrel version "9\.9\.9"\. Known versions: 1\.1\.1, 1\.2\.1 \(or "latest"\)/)
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  // squirrel.windows@1.2.0 was withdrawn (its bundle lacked required license files) in favour of 1.2.1,
  // so pinning it must fail instead of downloading the flagged release.
  test('the withdrawn "1.2.0" pin is rejected before any download', async () => {
    const promise = getSquirrelToolsetPath("1.2.0" as any, tmpDir)
    await expect(promise).rejects.toBeInstanceOf(InvalidConfigurationError)
    await expect(promise).rejects.toThrow(/Unknown toolsets\.squirrel version "1\.2\.0"/)
    expect(downloadBuilderToolset).not.toHaveBeenCalled()
  })

  test("download failures propagate", async () => {
    vi.mocked(downloadBuilderToolset).mockRejectedValueOnce(new Error("network error"))
    await expect(getSquirrelToolsetPath("1.1.1", tmpDir)).rejects.toThrow("network error")
  })
})
