import { FileStats, loadCache } from "./cache.js"
import { detectHeavyFile } from "./file-discovery.js"
import { CI_PARALLELISM, DEFAULT_FILE_MS, getTestFilesOverride, SAFEGUARD_MAX_SHARDS, SupportedPlatforms, TARGET_MS, TargetPlatform, TEST_ROOT } from "./smart-config.js"

export interface WeightedFile {
  filename: string
  weight: number
  filepath: string
  cachedMs?: number // raw avgMs from cache; undefined = no data (DEFAULT_FILE_MS was used)
  /** The file has heavy tests, which run one at a time across the shard's workers (see vitest-heavy-mutex.ts). */
  heavy?: boolean
}

/**
 * Resolve a file's measured average duration for a platform, or undefined when it has never run
 * there. Ownership of the "is this duration real?" rule: a run count of 0 is the only signal for
 * "unknown" — a genuine measured 0 ms (e.g. a fully-skipped suite) is kept rather than coerced
 * away, so real sub-millisecond timings aren't discarded and replaced by DEFAULT_FILE_MS.
 */
export function resolveCachedMs(stat: FileStats | undefined, platform: SupportedPlatforms): number | undefined {
  const run = stat?.platformRuns?.[platform]
  return run && run.runs > 0 ? run.avgMs : undefined
}

/**
 * Build weighted files based on platform-specific avgMs
 */
export function buildWeightedFiles(files: string[], targetPlatform: TargetPlatform): WeightedFile[] {
  const cache = loadCache()

  const currentPlatform = targetPlatform === "current" ? (process.platform as SupportedPlatforms) : targetPlatform
  return files.map(file => {
    // Cache keys are relative to TEST_ROOT (e.g. "updater/blackboxInstallTest.ts"), not basename
    const key = file.slice(TEST_ROOT.length + 1)
    const stat = cache.files[key]
    const cachedMs = resolveCachedMs(stat, currentPlatform)
    const base = cachedMs ?? DEFAULT_FILE_MS
    const weight = stat?.unstable ? base * 1.5 : base

    const heavy = stat?.hasHeavyTests === true || detectHeavyFile(file)

    return { filename: key, weight, filepath: file, cachedMs, heavy }
  })
}

/**
 * Estimated wall-clock time of one shard: its files spread over the runner's workers (`speedup`, see CI_PARALLELISM), but never less
 * than its heavy files, which run one after another.
 */
export function estimateShardMs(files: ReadonlyArray<WeightedFile>, speedup = 1): number {
  const total = files.reduce((sum, f) => sum + f.weight, 0)
  const heavy = files.reduce((sum, f) => sum + (f.heavy ? f.weight : 0), 0)
  return Math.max(total / speedup, heavy)
}

/**
 * Compute the shard count for a platform: enough shards that each fits TARGET_MS of wall-clock time, with the files of a shard running
 * on CI_PARALLELISM workers and its heavy files one at a time.
 */
export function computeShardCount(files: WeightedFile[], platform: SupportedPlatforms): number {
  // a scoped run (real TEST_FILES override) or an explicit count is never smart-sharded; a blank TEST_FILES is neither
  if (!process.env.CI || getTestFilesOverride() != null || process.env.VITEST_SHARD_COUNT) {
    return Math.max(1, parseInt(process.env.VITEST_SHARD_COUNT || "1", 10))
  }

  const { speedup } = CI_PARALLELISM[platform]
  const total = files.reduce((a, b) => a + b.weight, 0)
  const heavyTotal = files.reduce((a, b) => a + (b.heavy ? b.weight : 0), 0)
  const actualShardCount = Math.max(1, Math.ceil(total / (TARGET_MS * speedup)), Math.ceil(heavyTotal / TARGET_MS))
  return Math.min(actualShardCount, SAFEGUARD_MAX_SHARDS)
}

/**
 * The CI matrix is sized by the planner job (smart-shard-count.ts) and every shard job re-plans locally;
 * both must arrive at the same plan or files are silently skipped or run twice across shards. Returns an
 * error message when the in-job count differs from the matrix size (VITEST_EXPECTED_SHARD_COUNT), else null.
 * Callers must fail on a mismatch — never clamp or re-map the shard index.
 */
export function shardPlanMismatchError(expectedShardCount: number | null, shardCount: number, cacheSource?: string): string | null {
  if (expectedShardCount == null || expectedShardCount === shardCount) {
    return null
  }
  return (
    `Shard plan mismatch: the CI matrix was planned with ${expectedShardCount} shard(s) but this job computed ${shardCount}. ` +
    `The planner and this job must use the same smart cache (VITEST_SMART_CACHE_SOURCE=${cacheSource || "<unset>"}) and the same test file list.`
  )
}

/**
 * Split files into balanced shards based on weight (duration). Greedy bin-packing, longest files first: heavy files are spread first so
 * that each shard's serial heavy work stays even, then every other file goes to the shard with the lowest estimated wall-clock time
 * (see estimateShardMs). With `speedup` 1 (one file at a time) this is plain longest-first packing by total duration.
 */
export function splitIntoShards(weighted: WeightedFile[], shardCount: number, speedup = 1): WeightedFile[][] {
  // Sort by weight descending (longest files first); the filename breaks ties so planner and shard jobs agree on the plan
  weighted.sort((a, b) => b.weight - a.weight || a.filename.localeCompare(b.filename))

  const shards: WeightedFile[][] = Array.from({ length: shardCount }, () => [])
  const loads = new Array<number>(shardCount).fill(0)
  const heavyLoads = new Array<number>(shardCount).fill(0)
  const lowest = (score: (i: number) => number) => loads.reduce((best, _, i) => (score(i) < score(best) ? i : best), 0)
  const place = (f: WeightedFile, idx: number) => {
    shards[idx].push(f)
    loads[idx] += f.weight
    if (f.heavy) {
      heavyLoads[idx] += f.weight
    }
  }

  for (const f of weighted.filter(f => f.heavy)) {
    place(
      f,
      lowest(i => heavyLoads[i] + loads[i] / 1e6)
    )
  }
  for (const f of weighted.filter(f => !f.heavy)) {
    place(
      f,
      lowest(i => Math.max(heavyLoads[i], (loads[i] + f.weight) / speedup))
    )
  }

  return shards
}

/**
 * Get files for a specific shard index
 */
export function getShardFiles(allFiles: string[], shardIndex: number, shardCount: number, currentPlatform: SupportedPlatforms): string[] {
  const weighted = buildWeightedFiles(allFiles, currentPlatform)
  const shards = splitIntoShards(weighted, shardCount)

  if (shardIndex < 0 || shardIndex >= shards.length) {
    return []
  }

  return shards[shardIndex].map(f => f.filepath)
}
