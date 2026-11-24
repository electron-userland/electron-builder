#!/usr/bin/env tsx

import { getAllTestFiles } from "./vitest-config/file-discovery.js"
import { buildWeightedFiles, computeShardCount, estimateShardMs, splitIntoShards, WeightedFile } from "./vitest-config/shard-builder.js"
import { CI_PARALLELISM, SupportedPlatforms } from "./vitest-config/smart-config.js"
import { generateTests } from "./generate-tests.js"
import { formatDuration } from "./vitest-config/vitest-smart-sequencer.js"

function printPlatformPlan(platform: SupportedPlatforms, shards: WeightedFile[][]): void {
  const platformTotal = shards.flat().reduce((s, f) => s + f.weight, 0)
  const { workers, speedup } = CI_PARALLELISM[platform]
  const header = `=== Shard Plan: ${platform} (${shards.length} shard${shards.length !== 1 ? "s" : ""}, ${workers} files at once) ===`
  console.log(header)

  for (let i = 0; i < shards.length; i++) {
    const shard = shards[i].sort((a, b) => a.filename.localeCompare(b.filename))
    const shardTotal = shard.reduce((s, f) => s + f.weight, 0)
    console.log(`  Shard ${i}  (${formatDuration(shardTotal)} of tests, ${formatDuration(estimateShardMs(shard, speedup))} wall)`)
    for (const f of shard) {
      const display = f.cachedMs !== undefined ? formatDuration(f.cachedMs) : "unknown"
      console.log(`    ${f.filename.padEnd(50)} ${display}${f.heavy ? " [heavy]" : ""}`)
    }
  }

  console.log(`  Platform total: ${formatDuration(platformTotal)}`)
  console.log("=".repeat(header.length))
  console.log()
}

function main() {
  generateTests()

  const platforms: SupportedPlatforms[] = ["linux", "win32", "darwin"]
  let grandTotal = 0

  const shardCounts = platforms.reduce(
    (acc, platform) => {
      const files = getAllTestFiles(platform)
      const weighted = buildWeightedFiles(files, platform)
      const shardCount = computeShardCount(weighted, platform)
      const shards = splitIntoShards(weighted, shardCount, CI_PARALLELISM[platform].speedup)

      printPlatformPlan(platform, shards)
      grandTotal += shards.flat().reduce((s, f) => s + f.weight, 0)

      acc[platform] = Array.from({ length: shardCount }, (_, i) => i)
      return acc
    },
    {} as Record<SupportedPlatforms, number[]>
  )

  console.log(`Grand total across all platforms: ${formatDuration(grandTotal)}`)
  console.log()

  // Output as JSON for GitHub Actions to consume (tail -n1)
  process.stdout.write(JSON.stringify(shardCounts))
}

main()
