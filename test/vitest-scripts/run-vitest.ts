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

  // Per-run report id — unique across every shard/job so artifacts never collide. The pid keeps the
  // two ci:test invocations that share a single runner (snap core24: docker pass + native pass)
  // distinct. Encodes platform + shard so the merge job can group results without extra metadata.
  // Written under cwd (the repo root, and the docker `-v $(pwd):/project` mount), so reports emitted
  // inside the container surface on the host for artifact upload — same path contract as the cache.
  // NB: the blob dir is deliberately NOT vitest's default `.vitest-reports` — actions/upload-artifact
  // excludes dot-directories (include-hidden-files defaults to false), which would silently drop every
  // blob from the uploaded report artifact. A non-hidden dir is included normally.
  const reportId = `${currentPlatform}-shard${index}-pid${process.pid}`
  const reporters: any[] = [
    "default",
    __dirname + "/vitest-config/vitest-smart-reporter.ts",
    ["json", { outputFile: `test-results/results-${reportId}.json` }],
    ["blob", { outputFile: `vitest-blobs/blob-${reportId}.json` }],
  ]

  // Opt-in v8 coverage (VITEST_COVERAGE=true, set by the collect-coverage workflow input). Each shard
  // writes a raw coverage map; the merge job combines them into one downloadable report. Spread in
  // only when enabled — passing `coverage: undefined` trips vitest's config resolver.
  const coverageOption =
    process.env.VITEST_COVERAGE === "true"
      ? {
          coverage: {
            enabled: true,
            provider: "v8" as const,
            // Only our own TypeScript sources (imported in-process via the workspace aliases below);
            // work offloaded to spawned binaries is not measured. Emit the raw istanbul-shaped map per
            // shard so the merge job can combine all shards into one report.
            include: ["packages/*/src/**"],
            reporter: ["json"],
            reportsDirectory: `coverage/${reportId}`,
            clean: true,
          },
        }
      : {}

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
      setupFiles: [__dirname + "/vitest-config/vitest-setup.ts", __dirname + "/vitest-config/vitest-heavy-mutex.ts", __dirname + "/vitest-config/vitest-tmpdir.ts"],
      include: [`test/src/**/${includeGlob}.ts`],

      runner: __dirname + "/vitest-config/vitest-network-retry-runner.ts",
      reporters,
      ...coverageOption,

      // Disable Vitest's default file-based parallelism and use our custom shard-based sequencing instead.  This ensures that tests are grouped into shards according to our custom logic (e.g. platform-specific weighting) rather than Vitest's default file-based distribution.
      // It's either disabling here or increasing test timeout to be generous due to the I/O-heavy nature of our tests and the fact that running many in parallel can exhaust memory (e.g. due to multiple icon-tool spawns across workers).
      // Disabling file-based parallelism is more efficient than increasing timeouts, as it allows us to run tests in parallel at the shard level while keeping individual test files running sequentially within each shard.
      fileParallelism: false,
      sequence: {
        sequencer: SmartSequencer,
        concurrent: false,
      },

      slowTestThreshold: 3 * 60 * 1000,
      testTimeout: 15 * 60 * 1000, // disk operations can be slow. We're generous with the timeout here to account for less-performant hardware

      snapshotFormat: {
        printBasicPrototype: false,
      },
      resolveSnapshotPath: (testPath, snapshotExtension) => {
        const snapshotPath = testPath
          .replace(/\.[tj]s$/, `.js${snapshotExtension}`)
          // Wine-variant test files share snapshots with the non-wine variants — the wine
          // dimension is an execution detail (run via Wine vs natively), not a content
          // dimension.  Strip the `__wine-X.Y.Z` segment before computing the snapshot path so
          // both variants resolve to the same .snap file. Match the dotted version digits
          // precisely so we neither stop at the first dot (`[^_.]+` → leaves `.Y.Z`) nor greedily
          // consume the trailing `.win` separator on `__wine-0.0.0.win.Test.ts` (`[\d.]+`).
          .replace(/__wine-\d+(?:\.\d+)*/, "")
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
