#!/usr/bin/env ts-node

import isCI from "is-ci"
import { startVitest } from "vitest/node"
import { getAllTestFiles } from "./vitest-config/file-discovery"
import { generateTests } from "./generate-tests"
import { buildWeightedFiles, computeShardCount, splitIntoShards } from "./vitest-config/shard-builder"
import { SHARD_INDEX, SupportedPlatforms, TEST_FILES_PATTERN } from "./vitest-config/smart-config"
import SmartSequencer from "./vitest-config/vitest-smart-sequencer"
import * as path from "path"

const testRegex = TEST_FILES_PATTERN?.split(",")
const includeRegex = `(${testRegex.join("|")}|${testRegex.map(t => `${t}*Test`).join("|")})`
console.log("TEST_FILES pattern", includeRegex)

async function main() {
  if (!process.env.SKIP_GENERATE) {
    generateTests()
  }

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

  console.log(`\n=== Shard ${index + 1} of ${shardCount} ===`)
  console.log(`Scanned Files: ${selectedFiles.length}`)

  return startVitest("test", selectedFiles, {
    allowOnly: !isCI, // Prevent accidental commit of `test.only` in CI
    update: process.env.UPDATE_SNAPSHOT === "true",

    // we manually set `globalThis.test` and `globalThis.describe` in vitest-setup.ts to make sure everything works correctly
    globals: false,

    // Allow test metadata
    includeTaskLocation: true,
    setupFiles: [path.join(__dirname, "vitest-config", "vitest-setup.ts"), path.join(__dirname, "vitest-config", "vitest-heavy-mutex.ts")],
    include: [`test/src/**/${includeRegex}.ts`],

    printConsoleTrace: true,
    runner: path.join(__dirname, "vitest-config", "vitest-network-retry-runner.ts"),
    reporters: ["default", path.join(__dirname, "vitest-config", "vitest-smart-reporter.ts")],

    // 2 on Windows (heavy MSI/Squirrel builds saturate the vitest main-thread RPC at 3); 3 elsewhere
    maxWorkers: process.platform === "win32" ? 2 : 3,

    sequence: {
      sequencer: SmartSequencer,
      concurrent: true,
    },

    slowTestThreshold: 2 * 60 * 1000,
    testTimeout: 10 * 60 * 1000, // disk operations can be slow. We're generous with the timeout here to account for less-performant hardware

    snapshotFormat: {
      printBasicPrototype: false,
    },
    resolveSnapshotPath: (testPath, snapshotExtension) => {
      const snapshotPath = testPath
        .replace(/\.[tj]s$/, `.js${snapshotExtension}`)
        .replace("/src/", "/snapshots/")
        .replace("\\src\\", "\\snapshots\\")
      // These suites assert the packed asar file tree across every package manager. The tree
      // content (files + sizes) is identical on all hosts, but two header fields are inherently
      // host-specific: the data-section packing `offset` (write order differs by OS) and the
      // Unix `executable` bit (NTFS does not carry it). Keep a dedicated Windows baseline so the
      // POSIX snapshots retain full fidelity and neither platform has to discard real data.
      if (process.platform === "win32" && /(?:packageManagerTest|HoistedNodeModuleTest)\.js\.snap$/.test(snapshotPath)) {
        return snapshotPath.replace(/\.snap$/, ".win.snap")
      }
      return snapshotPath
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
