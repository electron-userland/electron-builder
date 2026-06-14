#!/usr/bin/env tsx

import { isCI } from "ci-info"
import * as path from "path"
import { startVitest } from "vitest/node"
import { getAllTestFiles } from "./vitest-config/file-discovery.js"
import { generateTests } from "./generate-tests.js"
import { buildWeightedFiles, computeShardCount, splitIntoShards } from "./vitest-config/shard-builder.js"
import { SHARD_INDEX, SupportedPlatforms, TEST_FILES_PATTERN } from "./vitest-config/smart-config.js"
import SmartSequencer from "./vitest-config/vitest-smart-sequencer.js"

const PACKAGES_DIR = path.join(__dirname, "..", "..", "packages")
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const sourceAlias = (specifier: string, relPath: string) => ({
  find: new RegExp(`^${escapeRegex(specifier)}$`),
  replacement: path.join(PACKAGES_DIR, relPath),
})
const PACKAGES_DIR_FWD = PACKAGES_DIR.replace(/\\/g, "/")
const workspacePackageNames = [
  "app-builder-lib",
  "builder-util",
  "builder-util-runtime",
  "dmg-builder",
  "electron-builder",
  "electron-builder-squirrel-windows",
  "electron-publish",
  "electron-updater",
]
const workspaceSourceAliases = [
  sourceAlias("app-builder-lib/internal", "app-builder-lib/src/indexInternal.ts"),
  sourceAlias("app-builder-lib", "app-builder-lib/src/index.ts"),
  sourceAlias("builder-util/internal", "builder-util/src/indexInternal.ts"),
  sourceAlias("builder-util", "builder-util/src/util.ts"),
  sourceAlias("builder-util-runtime/internal", "builder-util-runtime/src/indexInternal.ts"),
  sourceAlias("builder-util-runtime", "builder-util-runtime/src/index.ts"),
  sourceAlias("electron-publish/internal", "electron-publish/src/indexInternal.ts"),
  sourceAlias("electron-publish", "electron-publish/src/index.ts"),
  sourceAlias("electron-updater/internal", "electron-updater/src/indexInternal.ts"),
  sourceAlias("electron-updater", "electron-updater/src/index.ts"),
  sourceAlias("dmg-builder", "dmg-builder/src/dmgUtil.ts"),
  sourceAlias("dmg-builder/internal", "dmg-builder/src/indexInternal.ts"),
  sourceAlias("electron-builder-squirrel-windows", "electron-builder-squirrel-windows/src/SquirrelWindowsTarget.ts"),
  sourceAlias("electron-builder/internal", "electron-builder/src/indexInternal.ts"),
  sourceAlias("electron-builder", "electron-builder/src/index.ts"),
  // Wildcard src/ alias: allows vi.mock/vi.importActual to reference individual source files
  // (e.g. "electron-publish/src/s3/awsCredentials") without exposing ./src/* in package.json exports.
  // Must come after the exact-match aliases above so it only fires for unmatched src/ paths.
  {
    find: new RegExp(`^(${workspacePackageNames.map(escapeRegex).join("|")})/src/(.+?)(?:\\.js)?$`),
    replacement: `${PACKAGES_DIR_FWD}/$1/src/$2.ts`,
  },
]

const testPatterns = TEST_FILES_PATTERN.split(",")
  .map(s => s.trim())
  .filter(Boolean)
const includeGlob = `(${testPatterns.join("|")}|${testPatterns.map(t => `${t}*Test`).join("|")})`
console.log("TEST_FILES pattern", includeGlob)

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

  return startVitest(
    "test",
    selectedFiles,
    {
      allowOnly: !isCI, // Prevent accidental commit of `test.only` in CI
      update: process.env.UPDATE_SNAPSHOT === "true",

      // we manually set `globalThis.test` and `globalThis.describe` in vitest-setup.ts to make sure everything works correctly
      globals: false,

      // Allow test metadata
      includeTaskLocation: true,
      setupFiles: [__dirname + "/vitest-config/vitest-setup.ts", __dirname + "/vitest-config/vitest-heavy-mutex.ts"],
      include: [`test/src/**/${includeGlob}.ts`],

      printConsoleTrace: true,
      runner: __dirname + "/vitest-config/vitest-network-retry-runner.ts",
      reporters: ["default", __dirname + "/vitest-config/vitest-smart-reporter.ts"],

      // 2 on Windows (heavy MSI/Squirrel builds saturate the vitest main-thread RPC at 3); 3 elsewhere
      maxWorkers: process.platform === "win32" ? 2 : 3,

      fileParallelism: false,
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
    },
    {
      resolve: {
        alias: workspaceSourceAliases,
      },
    }
  )
    .then(() => {
      console.log("Vitest run completed")
    })
    .catch(err => {
      console.error("Error running Vitest:", err)
      process.exit(1)
    })
}

if (require.main === module) {
  void main()
}
export default main
