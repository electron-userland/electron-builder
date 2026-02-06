#!/usr/bin/env ts-node

import { spawnSync } from "child_process"
import { getAllTestFiles } from "./file-discovery"
import { buildWeightedFiles, computeShardCount, splitIntoShards } from "./shard-builder"
import { DEFAULT_FILE_MS, SHARD_INDEX, SupportedPlatforms } from "./smart-config"

function main() {
  const files = getAllTestFiles()
  const currentPlatform = process.platform as SupportedPlatforms

  console.log(`Platform: ${currentPlatform}`)
  console.log(`Total test files found: ${files.length}`)

  // Build weighted files with platform-specific durations
  const weighted = buildWeightedFiles(files, currentPlatform)

  const shardCount = computeShardCount(weighted)
  const shards = splitIntoShards(weighted, shardCount)

  const index = SHARD_INDEX ?? 0

  if (index >= shardCount) {
    console.error(`Error: Shard index ${index} is out of range (max: ${shardCount - 1})`)
    process.exit(1)
  }

  const selectedShard = shards[index]

  if (!selectedShard || selectedShard.length === 0) {
    console.log(`No tests in shard ${index + 1}`)
    process.exit(0)
  }

  // Extract file paths from WeightedFile objects
  const selectedFiles = selectedShard.map(wf => wf.filepath)
  const estimatedDuration = selectedShard.reduce((sum, wf) => sum + (wf.weight || 0), 0)

  console.log(`\n=== Shard ${index + 1} of ${shardCount} ===`)
  console.log(`Scanned Files: ${selectedFiles.length}`)
  console.log(`Estimated duration: ${Math.round(estimatedDuration / 1000).toLocaleString()}s`)
  console.log(`\nTest files:`)
  selectedShard
    .sort((a, b) => a.filename.localeCompare(b.filename))
    .forEach(wf => {
      const durationStr = wf.weight !== DEFAULT_FILE_MS ? `~${Math.round(wf.weight / 1000)}s` : "unknown"
      console.log(`  - ${wf.filename} (${durationStr})`)
    })
  console.log()

  const r = spawnSync("vitest", ["run", ...selectedFiles], {
    stdio: "inherit",
    shell: true,
  })

  process.exit(r.status ?? 1)
}

main()
