import { spawnSync, type SpawnSyncReturns } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { downloadArtifact } from "../vitest-scripts/fetch-smart-cache"

vi.mock("child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("child_process")>()
  return { ...actual, spawnSync: vi.fn() }
})

const EGRESS_THROTTLED =
  "error downloading vitest-smart-cache-PR-1: HTTP 503: Egress is over the account limit. (https://productionresultssa1.blob.core.windows.net/actions-results/x.zip)"

// Each entry is one `gh run download` attempt: "ok" writes the cache file into the --dir it was given, anything else fails
// with that text on stderr.
function mockGhDownloads(outcomes: string[]) {
  for (const outcome of outcomes) {
    vi.mocked(spawnSync).mockImplementationOnce(((_command: string, args: string[]): SpawnSyncReturns<string> => {
      if (outcome === "ok") {
        fs.writeFileSync(path.join(args[args.indexOf("--dir") + 1], "_vitest-smart-cache.json"), '{"files":{}}')
      }
      return { pid: 1, output: [], stdout: "", stderr: outcome === "ok" ? "" : outcome, status: outcome === "ok" ? 0 : 1, signal: null }
    }) as unknown as typeof spawnSync)
  }
}

describe("fetch-smart-cache downloadArtifact", { concurrent: false }, () => {
  let sleeps: number[]

  beforeEach(() => {
    sleeps = []
    vi.spyOn(Atomics, "wait").mockImplementation((_array, _index, _value, timeout) => {
      sleeps.push(timeout ?? 0)
      return "timed-out"
    })
  })

  afterEach(() => {
    vi.mocked(spawnSync).mockReset()
    vi.restoreAllMocks()
  })

  test("retries an egress-throttled download with exponential backoff and jitter before giving up", async ({ tmpDir }) => {
    const dest = path.join(await tmpDir.getTempDir({ prefix: "smart-cache" }), "_vitest-smart-cache.json")
    mockGhDownloads(Array(5).fill(EGRESS_THROTTLED))

    expect(downloadArtifact(1, "vitest-smart-cache-PR-1", dest)).toBe(false)
    expect(spawnSync).toHaveBeenCalledTimes(5)
    expect(fs.existsSync(dest)).toBe(false)

    expect(sleeps).toHaveLength(4)
    for (const [i, base] of [15_000, 30_000, 60_000, 120_000].entries()) {
      expect(sleeps[i]).toBeGreaterThanOrEqual(base)
      expect(sleeps[i]).toBeLessThanOrEqual(base * 1.2)
    }
    expect(sleeps.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(5 * 60_000)
  })

  test("restores the artifact once throttling clears", async ({ tmpDir }) => {
    const dest = path.join(await tmpDir.getTempDir({ prefix: "smart-cache" }), "_vitest-smart-cache.json")
    mockGhDownloads([EGRESS_THROTTLED, EGRESS_THROTTLED, EGRESS_THROTTLED, "ok"])

    expect(downloadArtifact(1, "vitest-smart-cache-PR-1", dest)).toBe(true)
    expect(spawnSync).toHaveBeenCalledTimes(4)
    expect(sleeps).toHaveLength(3)
    expect(fs.readFileSync(dest, "utf8")).toBe('{"files":{}}')
  })

  test("keeps the short fixed retry for other failures", async ({ tmpDir }) => {
    const dest = path.join(await tmpDir.getTempDir({ prefix: "smart-cache" }), "_vitest-smart-cache.json")
    mockGhDownloads(Array(5).fill("HTTP 404: Not Found"))

    expect(downloadArtifact(1, "vitest-smart-cache-PR-1", dest)).toBe(false)
    expect(spawnSync).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([5000, 5000])
  })
})
