#!/usr/bin/env ts-node

import isCI from "is-ci"
import { startVitest } from "vitest/node"
import { getAllTestFiles } from "./file-discovery"
import { buildWeightedFiles, computeShardCount, splitIntoShards } from "./shard-builder"
import { DEFAULT_FILE_MS, SHARD_INDEX, SupportedPlatforms, TEST_FILES_PATTERN } from "./smart-config"
import SmartSequencer from "./vitest-smart-sequencer"

const testRegex = TEST_FILES_PATTERN?.split(",")
const includeRegex = `(${testRegex.join("|")})`
console.log("TEST_FILES pattern", includeRegex)

async function main() {
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
    process.exit(1)
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

  return startVitest("test", selectedFiles, {
    run: isCI,
    watch: !isCI,
    allowOnly: !isCI, // Prevent accidental commit of `test.only` in CI
    update: process.env.UPDATE_SNAPSHOT === "true",

    // we manually set `globalThis.test` and `globalThis.describe` in vitest-setup.ts to make sure everything works correctly
    globals: false,

    // Allow test metadata
    includeTaskLocation: true,
    setupFiles: [__dirname + "/vitest-setup.ts", __dirname + "/vitest-heavy-mutex.ts"],
    include: [`test/src/**/${includeRegex}.ts`],

    printConsoleTrace: true,
    reporters: ["default", __dirname + "/vitest-smart-reporter.ts"],

    maxWorkers: "50%",
    minWorkers: 1,

    // Ensure tests from different files can run in parallel
    // but heavy tests will be serialized by the mutex
    fileParallelism: true,
    sequence: {
      sequencer: SmartSequencer,
      concurrent: process.env.TEST_SEQUENTIAL !== "true",
    },

    slowTestThreshold: 2 * 60 * 1000,
    testTimeout: 10 * 60 * 1000, // disk operations can be slow. We're generous with the timeout here to account for less-performant hardware

    snapshotFormat: {
      printBasicPrototype: false,
    },
    resolveSnapshotPath: (testPath, snapshotExtension) => {
      return testPath
        .replace(/\.[tj]s$/, `.js${snapshotExtension}`)
        .replace("/src/", "/snapshots/")
        .replace("\\src\\", "\\snapshots\\")
    },
  })
    .then(() => {
      console.log("Vitest run completed")
    })
    .catch(err => {
      console.error("Error running Vitest:", err)
      process.exit(1)
    })
}

void main()
