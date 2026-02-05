import * as path from "path"
import { BaseSequencer, TestSpecification } from "vitest/node"
import { loadCache } from "./cache"
import { platformAllowed } from "./file-discovery"
import { buildWeightedFiles, splitIntoShards } from "./shard-builder"
import { SupportedPlatforms } from "./smart-config"

export default class SmartSequencer extends BaseSequencer {
  readonly cache = loadCache()

  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const currentPlatform = process.platform as SupportedPlatforms

    // Filter to only files allowed on this platform
    const eligible = files.filter(f => platformAllowed(f.moduleId))

    // Check if we're in shard mode
    const shardEnv = process.env.VITEST_SHARD
    if (shardEnv) {
      const [shardIndexStr, shardCountStr] = shardEnv.split("/")
      const shardIndex = parseInt(shardIndexStr, 10) - 1 // Convert to 0-based
      const shardCount = parseInt(shardCountStr, 10)

      if (!isNaN(shardIndex) && !isNaN(shardCount)) {
        return this.sortWithSharding(eligible, shardIndex, shardCount, currentPlatform)
      }
    }

    // No sharding, just sort by priority
    return this.sortByPriority(eligible)
  }

  private async sortWithSharding(files: TestSpecification[], shardIndex: number, shardCount: number, currentPlatform: SupportedPlatforms): Promise<TestSpecification[]> {
    // Build weighted files using platform-specific durations
    const weighted = buildWeightedFiles(
      files.map(f => f.moduleId),
      currentPlatform
    )

    // Split into shards based on duration
    const shards = splitIntoShards(weighted, shardCount)

    // Get files for this shard
    const shardFiles = shards[shardIndex] || []
    const shardFileIds = new Set(shardFiles.map(f => f.moduleId))

    // Filter to only files in this shard
    const shardSpecs = files.filter(f => shardFileIds.has(f.moduleId))

    // Sort within shard by priority
    return this.sortByPriority(shardSpecs)
  }

  private async sortByPriority(files: TestSpecification[]): Promise<TestSpecification[]> {
    // Separate heavy test files from regular ones
    const heavyFiles: TestSpecification[] = []
    const regularFiles: TestSpecification[] = []

    for (const file of files) {
      const basename = path.basename(file.moduleId)
      const fileStats = this.cache.files[basename]

      if (fileStats?.hasHeavyTests) {
        heavyFiles.push(file)
      } else {
        regularFiles.push(file)
      }
    }

    // Sort heavy files by duration (longest first) to run them early
    const sortedHeavy = heavyFiles.sort((a, b) => {
      const A = this.cache.files[path.basename(a.moduleId)]
      const B = this.cache.files[path.basename(b.moduleId)]
      const aScore = (A?.unstable ? 1_000_000 : 0) + (A?.avgMs ?? 0)
      const bScore = (B?.unstable ? 1_000_000 : 0) + (B?.avgMs ?? 0)
      return bScore - aScore
    })

    // Sort regular files by priority (unstable/long first)
    const sortedRegular = regularFiles.sort((a, b) => {
      const A = this.cache.files[path.basename(a.moduleId)]
      const B = this.cache.files[path.basename(b.moduleId)]
      const aScore = (A?.unstable ? 1_000_000 : 0) + (A?.avgMs ?? 0)
      const bScore = (B?.unstable ? 1_000_000 : 0) + (B?.avgMs ?? 0)
      return bScore - aScore
    })

    // Heavy tests run first, then regular tests
    // This allows heavy tests to claim workers early and run sequentially
    return Promise.resolve([...sortedHeavy, ...sortedRegular])
  }
}
