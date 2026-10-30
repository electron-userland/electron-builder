import { spawnSync, type SpawnSyncReturns } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { downloadArtifact, main } from "../vitest-scripts/fetch-smart-cache"

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

// Serves `gh api` artifact lookups with one live artifact and fails every `gh run download` with `downloadError`.
function mockGhWithFailingDownloads(downloadError: string) {
  vi.mocked(spawnSync).mockImplementation(((_command: string, args: string[]): SpawnSyncReturns<string> => {
    const lookup = args[0] === "api"
    const stdout = lookup ? JSON.stringify({ artifacts: [{ expired: false, created_at: "2026-10-30T00:00:00Z", workflow_run: { id: 1 } }] }) : ""
    return { pid: 1, output: [], stdout, stderr: lookup ? "" : downloadError, status: lookup ? 0 : 1, signal: null }
  }) as unknown as typeof spawnSync)
}

// The --name of every `gh run download` call, in order.
function downloadedArtifactNames(): string[] {
  return vi
    .mocked(spawnSync)
    .mock.calls.map(([, args = []]) => args)
    .filter(args => args[0] === "run")
    .map(args => args[args.indexOf("--name") + 1])
}

function expectThrottledBackoff(sleeps: number[]) {
  expect(sleeps).toHaveLength(4)
  for (const [i, base] of [15_000, 30_000, 60_000, 120_000].entries()) {
    expect(sleeps[i]).toBeGreaterThanOrEqual(base)
    expect(sleeps[i]).toBeLessThanOrEqual(base * 1.2)
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

    expect(downloadArtifact(1, "vitest-smart-cache-PR-1", dest, { backOffWhenThrottled: true })).toBe(false)
    expect(spawnSync).toHaveBeenCalledTimes(5)
    expect(fs.existsSync(dest)).toBe(false)

    expectThrottledBackoff(sleeps)
    expect(sleeps.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(5 * 60_000)
  })

  test("restores the artifact once throttling clears", async ({ tmpDir }) => {
    const dest = path.join(await tmpDir.getTempDir({ prefix: "smart-cache" }), "_vitest-smart-cache.json")
    mockGhDownloads([EGRESS_THROTTLED, EGRESS_THROTTLED, EGRESS_THROTTLED, "ok"])

    expect(downloadArtifact(1, "vitest-smart-cache-PR-1", dest, { backOffWhenThrottled: true })).toBe(true)
    expect(spawnSync).toHaveBeenCalledTimes(4)
    expect(sleeps).toHaveLength(3)
    expect(fs.readFileSync(dest, "utf8")).toBe('{"files":{}}')
  })

  test("keeps the short fixed retry for other failures", async ({ tmpDir }) => {
    const dest = path.join(await tmpDir.getTempDir({ prefix: "smart-cache" }), "_vitest-smart-cache.json")
    mockGhDownloads(Array(5).fill("HTTP 404: Not Found"))

    expect(downloadArtifact(1, "vitest-smart-cache-PR-1", dest, { backOffWhenThrottled: true })).toBe(false)
    expect(spawnSync).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([5000, 5000])
  })

  test("stops at the short retry limit when a throttled run turns into another failure", async ({ tmpDir }) => {
    const dest = path.join(await tmpDir.getTempDir({ prefix: "smart-cache" }), "_vitest-smart-cache.json")
    // Attempt 4 is already past the 3-attempt limit of a non-throttled failure, so it must be the last one. The fifth outcome is
    // only reached if the limit check misses that.
    mockGhDownloads([EGRESS_THROTTLED, EGRESS_THROTTLED, EGRESS_THROTTLED, "HTTP 404: Not Found", EGRESS_THROTTLED])

    expect(downloadArtifact(1, "vitest-smart-cache-PR-1", dest, { backOffWhenThrottled: true })).toBe(false)
    expect(spawnSync).toHaveBeenCalledTimes(4)
    expect(sleeps).toHaveLength(3)
    expect(fs.existsSync(dest)).toBe(false)
  })

  test("uses the short fixed retry on a throttled download unless asked to back off", async ({ tmpDir }) => {
    const dest = path.join(await tmpDir.getTempDir({ prefix: "smart-cache" }), "_vitest-smart-cache.json")
    mockGhDownloads(Array(5).fill(EGRESS_THROTTLED))

    expect(downloadArtifact(1, "vitest-smart-cache-PR-1", dest)).toBe(false)
    expect(spawnSync).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([5000, 5000])
  })
})

describe("fetch-smart-cache main", { concurrent: false }, () => {
  let sleeps: number[]

  beforeEach(() => {
    sleeps = []
    vi.spyOn(Atomics, "wait").mockImplementation((_array, _index, _value, timeout) => {
      sleeps.push(timeout ?? 0)
      return "timed-out"
    })
    vi.spyOn(console, "log").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.mocked(spawnSync).mockReset()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  test("the shard planner keeps the short retry on a throttled download and falls back to no cache", async ({ tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "smart-cache" })
    const githubOutput = path.join(dir, "github-output")
    vi.stubEnv("VITEST_SMART_CACHE_SOURCE", "")
    vi.stubEnv("VITEST_CACHE_REF", "PR-1")
    vi.stubEnv("GITHUB_OUTPUT", githubOutput)
    mockGhWithFailingDownloads(EGRESS_THROTTLED)

    main(path.join(dir, "_vitest-smart-cache.json"))

    // 3 attempts for the PR artifact and 3 for the master fallback, with the 5s pause between attempts of each.
    expect(downloadedArtifactNames()).toEqual([...Array(3).fill("vitest-smart-cache-PR-1"), ...Array(3).fill("vitest-smart-cache-master")])
    expect(sleeps).toEqual([5000, 5000, 5000, 5000])
    expect(fs.readFileSync(githubOutput, "utf8")).toBe("source=none\n")
  })

  test("a shard job's pinned restore backs off on a throttled download before failing", async ({ tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "smart-cache" })
    vi.stubEnv("VITEST_SMART_CACHE_SOURCE", "vitest-smart-cache-PR-1@1")
    mockGhWithFailingDownloads(EGRESS_THROTTLED)

    expect(() => main(path.join(dir, "_vitest-smart-cache.json"))).toThrow("Failed to download pinned smart cache vitest-smart-cache-PR-1 from run 1")
    expect(downloadedArtifactNames()).toEqual(Array(5).fill("vitest-smart-cache-PR-1"))
    expectThrottledBackoff(sleeps)
  })
})
