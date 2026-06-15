import { loadCache } from "./cache.js"
import { DEFAULT_FILE_MS, SAFEGUARD_MAX_SHARDS, SupportedPlatforms, TARGET_MS, TargetPlatform, TEST_ROOT } from "./smart-config.js"

export interface WeightedFile {
  filename: string
  weight: number
  filepath: string
  cachedMs?: number // raw avgMs from cache; undefined = no data (DEFAULT_FILE_MS was used)
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
    // avgMs of 0 means no runs on this platform yet — treat as unknown
    const cachedMs = stat?.platformRuns?.[currentPlatform]?.avgMs || undefined
    const base = cachedMs ?? DEFAULT_FILE_MS
    const weight = stat?.unstable ? base * 1.5 : base

    return { filename: key, weight, filepath: file, cachedMs }
  })
}

/**
 * Compute optimal shard count based on total platform-specific duration
 */
export function computeShardCount(files: WeightedFile[]): number {
  if (!process.env.CI || process.env.TEST_FILES || process.env.VITEST_SHARD_COUNT) {
    return Math.max(1, parseInt(process.env.VITEST_SHARD_COUNT || "1", 10))
  }

  const total = files.reduce((a, b) => a + b.weight, 0)
  const actualShardCount = Math.max(1, Math.ceil(total / TARGET_MS))
  const safeguardedShardCount = Math.min(actualShardCount, SAFEGUARD_MAX_SHARDS)
  return safeguardedShardCount
}

/**
 * Split files into balanced shards based on weight (duration)
 * Uses greedy bin-packing algorithm to balance shard durations
 */
export function splitIntoShards(weighted: WeightedFile[], shardCount: number): WeightedFile[][] {
  // Sort by weight descending (longest files first)
  weighted.sort((a, b) => b.weight - a.weight)

  const shards: WeightedFile[][] = Array.from({ length: shardCount }, () => [])
  const loads = new Array(shardCount).fill(0)

  for (const f of weighted) {
    // Find shard with minimum current load
    const idx = loads.indexOf(Math.min(...loads))
    shards[idx].push(f)
    loads[idx] += f.weight
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
