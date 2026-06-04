#!/usr/bin/env tsx

import { getAllTestFiles } from "./file-discovery"
import { buildWeightedFiles, computeShardCount, splitIntoShards, WeightedFile } from "./shard-builder"
import { TargetPlatform } from "./smart-config"
import { generateTests } from "./generate-tests"
import { formatDuration } from "./vitest-smart-sequencer"

function printPlatformPlan(platform: string, shards: WeightedFile[][]): void {
  const platformTotal = shards.flat().reduce((s, f) => s + f.weight, 0)
  const header = `=== Shard Plan: ${platform} (${shards.length} shard${shards.length !== 1 ? "s" : ""}) ===`
  console.log(header)

  for (let i = 0; i < shards.length; i++) {
    const shard = shards[i].sort((a, b) => a.filename.localeCompare(b.filename))
    const shardTotal = shard.reduce((s, f) => s + f.weight, 0)
    console.log(`  Shard ${i}  (${formatDuration(shardTotal)})`)
    for (const f of shard) {
      const display = f.cachedMs !== undefined ? formatDuration(f.cachedMs) : "unknown"
      console.log(`    ${f.filename.padEnd(50)} ${display}`)
    }
  }

  console.log(`  Platform total: ${formatDuration(platformTotal)}`)
  console.log("=".repeat(header.length))
  console.log()
}

function main() {
  generateTests()

  const platforms: TargetPlatform[] = ["linux", "win32", "darwin"]
  let grandTotal = 0

  const shardCounts = platforms.reduce(
    (acc, platform) => {
      const files = getAllTestFiles(platform)
      const weighted = buildWeightedFiles(files, platform)
      const shardCount = computeShardCount(weighted)
      const shards = splitIntoShards(weighted, shardCount)

      printPlatformPlan(platform, shards)
      grandTotal += shards.flat().reduce((s, f) => s + f.weight, 0)

      acc[platform] = Array.from({ length: shardCount }, (_, i) => i)
      return acc
    },
    {} as Record<TargetPlatform, number[]>
  )

  console.log(`Grand total across all platforms: ${formatDuration(grandTotal)}`)
  console.log()

  // Output as JSON for GitHub Actions to consume (tail -n1)
  process.stdout.write(JSON.stringify(shardCounts))
}

main()
