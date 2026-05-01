#!/usr/bin/env ts-node

import { getAllTestFiles } from "./file-discovery"
import { buildWeightedFiles, computeShardCount } from "./shard-builder"
import { TargetPlatform } from "./smart-config"

/**
 * Compute shard indices for a given platform
 */
function computeShardIndicesForPlatform(platform: TargetPlatform): number[] {
  const files = getAllTestFiles(platform)
  const weighted = buildWeightedFiles(files, platform)
  const shardCount = computeShardCount(weighted)
  return Array.from({ length: shardCount }, (_, i) => i)
}

function main() {
  const platforms: TargetPlatform[] = ["linux", "win32", "darwin"]

  const shardCounts = platforms.reduce(
    (acc, platform) => {
      acc[platform] = computeShardIndicesForPlatform(platform)
      return acc
    },
    {} as Record<TargetPlatform, number[]>
  )
  // Output as JSON for GitHub Actions to consume
  process.stdout.write(JSON.stringify(shardCounts))
}

main()
