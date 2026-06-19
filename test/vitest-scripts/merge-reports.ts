#!/usr/bin/env tsx
/**
 * Merges every shard's Vitest blob report (.vitest-reports/blob-*.json, emitted by run-vitest.ts)
 * into the combined, downloadable reports the `merge-smart-cache` job uploads:
 *   - html-report/            interactive @vitest/ui test report (pass/fail across all shards)
 *   - merged-test-report.json machine-readable combined results
 *   - merged-coverage/        merged v8 coverage report (only when VITEST_COVERAGE=true)
 *
 * Vitest's `--merge-reports` works with our custom (file-subset) sharding because each shard is just
 * a normal Vitest run over a hand-picked file list — vitest's own `--shard` flag is not involved, so
 * the blobs concatenate cleanly. It must run from the repo root (the root the blobs were produced
 * with) for the file paths and reporter resolution (@vitest/ui at the root) to line up.
 *
 * Usage:
 *   tsx test/vitest-scripts/merge-reports.ts [--reports-dir .vitest-reports]
 */

import { spawnSync } from "child_process"
import * as path from "path"

function parseArgs(): { reportsDir: string } {
  const args = process.argv.slice(2)
  let reportsDir = ".vitest-reports"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--reports-dir" && args[i + 1]) {
      reportsDir = args[++i]
    }
  }
  return { reportsDir }
}

function main() {
  const { reportsDir } = parseArgs()

  // Resolve the vitest CLI relative to this script (test/ workspace) and run it via node so we don't
  // depend on a particular .bin shim location; cwd stays the repo root so blob paths/root match.
  const vitestPkg = require.resolve("vitest/package.json")
  const bin = path.join(path.dirname(vitestPkg), "vitest.mjs")

  const args = [
    bin,
    "--merge-reports=" + reportsDir,
    "--reporter=default",
    "--reporter=json",
    "--outputFile.json=merged-test-report.json",
    "--reporter=html",
    "--outputFile.html=html-report/index.html",
  ]

  if (process.env.VITEST_COVERAGE === "true") {
    args.push(
      "--coverage.enabled",
      "--coverage.provider=v8",
      "--coverage.reporter=html",
      "--coverage.reporter=json-summary",
      "--coverage.reporter=text",
      "--coverage.reportsDirectory=merged-coverage"
    )
  }

  console.log(`[merge-reports] node ${args.join(" ")}`)
  const result = spawnSync("node", args, { stdio: "inherit", cwd: process.cwd() })
  process.exit(result.status ?? 1)
}

main()
