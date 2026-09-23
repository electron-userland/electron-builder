#!/usr/bin/env tsx
/**
 * Merges every shard's Vitest blob report (vitest-blobs/blob-*.json, emitted by run-vitest.ts)
 * into the combined, downloadable reports the `merge-smart-cache` job uploads:
 *   - html-report/            interactive @vitest/ui test report (pass/fail across all shards)
 *   - merged-test-report.json machine-readable combined results
 *   - merged-coverage/        merged v8 coverage report (only when VITEST_COVERAGE=true)
 *
 * Vitest's merge-reports mode works with our custom (file-subset) sharding because each shard is just
 * a normal Vitest run over a hand-picked file list — vitest's own `--shard` flag is not involved, so
 * the blobs concatenate cleanly. It must run from the repo root (the root the blobs were produced
 * with) for the file paths and reporter resolution (@vitest/ui at the root) to line up.
 *
 * Usage:
 *   tsx test/vitest-scripts/merge-reports.ts [--reports-dir vitest-blobs]
 */

import { startVitest } from "vitest/node"

function parseArgs(): { reportsDir: string } {
  const args = process.argv.slice(2)
  let reportsDir = "vitest-blobs"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--reports-dir" && args[i + 1]) {
      reportsDir = args[++i]
    }
  }
  return { reportsDir }
}

async function main() {
  const { reportsDir } = parseArgs()

  // Programmatic rather than the CLI: since vitest 5 the html reporter takes an `outputDir` option
  // (default `.vitest/`) that has no CLI flag. cwd stays the repo root so blob paths/root match.
  const coverageOption =
    process.env.VITEST_COVERAGE === "true"
      ? {
          coverage: {
            enabled: true,
            provider: "v8" as const,
            reporter: ["html", "json-summary", "text"],
            reportsDirectory: "merged-coverage",
          },
        }
      : {}

  console.log(`[merge-reports] merging blob reports from ${reportsDir}`)
  const vitest = await startVitest([], {
    mergeReports: reportsDir,
    reporters: ["default", ["json", { outputFile: "merged-test-report.json" }], ["html", { outputDir: "html-report" }]],
    ...coverageOption,
  })
  await vitest.close()
}

main().catch(err => {
  console.error("[merge-reports] failed:", err)
  process.exit(1)
})
