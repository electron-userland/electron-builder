#!/usr/bin/env tsx
/**
 * Aggregates the per-shard Vitest JSON reports (results-*.json, emitted by run-vitest.ts) into a
 * single end-of-run summary: per-test durations, per-shard durations, the grand total, a combined
 * list of every failed test across all shards/platforms, and a de-duplicated skip breakdown (the raw
 * skip count multi-counts platform/PM-gated tests that load on every shard but run on only one).
 *
 * It prints a console table and — when running under GitHub Actions — appends a Markdown summary to
 * $GITHUB_STEP_SUMMARY, so failures and timings are visible on the run's summary page without having
 * to open each shard's job log.
 *
 * Usage:
 *   tsx test/vitest-scripts/test-summary.ts --results-dir report-artifacts
 *
 * Each report artifact downloaded by the merge job lands in its own subdirectory, e.g.
 *   report-artifacts/vitest-report-linux-3/test-results/results-linux-shard3-pid1234.json
 * The artifact subdirectory name (minus the "vitest-report-" prefix) is the shard/job label used to
 * group results — this stays correct even for the special jobs (updater, snap, e2e) that all run as
 * shard 0 and would otherwise collide on a filename-derived key.
 */

import * as fs from "fs"
import * as path from "path"
import { formatDuration } from "./vitest-config/vitest-smart-sequencer.js"

interface AssertionResult {
  fullName?: string
  title?: string
  status: string // passed | failed | skipped | pending | todo
  duration?: number
  failureMessages?: string[]
  ancestorTitles?: string[]
}
interface FileResult {
  name: string
  startTime?: number
  endTime?: number
  assertionResults?: AssertionResult[]
}
interface JsonReport {
  testResults?: FileResult[]
}

interface TestRow {
  group: string
  file: string
  name: string
  status: string
  durationMs: number
  error?: string
}
interface ShardAgg {
  group: string
  durationMs: number
  total: number
  passed: number
  failed: number
  skipped: number
}
interface SkipStats {
  rawSkipped: number // total skip rows across all shards (== totals.skipped)
  uniqueNeverRun: number // distinct (file, test) that are skipped on every shard they appear on — never executed anywhere
  routedSkips: number // skip rows whose (file, test) passed or failed on another shard (it ran, just not here)
  dupNeverRun: number // extra skip rows of a never-run test seen on more than one shard (e.g. an env-gated test on every PM leg)
}

const TEST_ROOT_MARKER = "/test/src/"
// GitHub caps a single step summary at 1 MiB; keep well under it. The full per-test table is the only
// unbounded section, so cap its row count and note the truncation rather than silently dropping rows.
const MAX_PER_TEST_ROWS = 4000

function parseArgs(): { resultsDir: string } {
  const args = process.argv.slice(2)
  let resultsDir = "report-artifacts"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--results-dir" && args[i + 1]) {
      resultsDir = args[++i]
    }
  }
  return { resultsDir }
}

// Group label = the top-level subdirectory under resultsDir (the downloaded artifact name), with the
// "vitest-report-" prefix stripped. Falls back to "local" when reports sit directly in resultsDir.
function groupOf(resultsDir: string, file: string): string {
  const rel = path.relative(resultsDir, file)
  const first = rel.split(path.sep)[0]
  if (!first || first === path.basename(file)) {
    return "local"
  }
  return first.replace(/^vitest-report-/, "")
}

function relFile(name: string): string {
  // Windows shards write `\`-separated paths; the merge job runs on Linux, so normalize both
  // separators explicitly rather than relying on the runner's path.sep.
  const norm = name.replace(/\\/g, "/")
  const idx = norm.indexOf(TEST_ROOT_MARKER)
  if (idx >= 0) {
    return norm.slice(idx + TEST_ROOT_MARKER.length)
  }
  return norm.split("/").pop() ?? norm
}

function findReports(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return []
  }
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    const base = path.basename(entry)
    if (base.startsWith("results-") && base.endsWith(".json")) {
      out.push(path.join(dir, entry))
    }
  }
  return out
}

function firstErrorLine(msgs?: string[]): string {
  if (!msgs || msgs.length === 0) {
    return ""
  }
  // Strip ANSI colour codes (optional ESC + "[…m") and collapse to the first meaningful line. ESC is
  // built via fromCharCode so the pattern carries no control character (eslint no-control-regex).
  const ansi = new RegExp(String.fromCharCode(27) + "?\\[[0-9;]*m", "g")
  const cleaned = msgs[0].replace(ansi, "")
  const line = cleaned.split("\n").find(l => l.trim().length > 0) ?? ""
  return line.trim()
}

// Markdown table cells cannot contain raw "|" or newlines. Escape backslashes FIRST so an input
// backslash can't combine with a subsequently-inserted escape (e.g. avoid turning "\" + "|" into a
// single "\|" escape) — see CodeQL "incomplete string escaping".
function md(cell: string): string {
  return cell.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim()
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}

function collect(resultsDir: string): { tests: TestRow[]; shards: Map<string, ShardAgg> } {
  const tests: TestRow[] = []
  const shards = new Map<string, ShardAgg>()

  for (const reportFile of findReports(resultsDir)) {
    const group = groupOf(resultsDir, reportFile)
    let report: JsonReport
    try {
      report = JSON.parse(fs.readFileSync(reportFile, "utf8"))
    } catch (err: any) {
      console.error(`[test-summary] Skipping unreadable report ${reportFile}: ${err.message}`)
      continue
    }

    const agg: ShardAgg = shards.get(group) ?? { group, durationMs: 0, total: 0, passed: 0, failed: 0, skipped: 0 }

    for (const fileResult of report.testResults ?? []) {
      const file = relFile(fileResult.name)
      // Prefer the file's wall span (includes setup/import; fileParallelism is off so files run
      // sequentially within a shard), falling back to the sum of assertion durations.
      const assertions = fileResult.assertionResults ?? []
      const span = fileResult.endTime && fileResult.startTime ? fileResult.endTime - fileResult.startTime : 0
      const assertionSum = assertions.reduce((s, a) => s + (a.duration ?? 0), 0)
      agg.durationMs += span > 0 ? span : assertionSum

      for (const a of assertions) {
        const status = a.status === "pending" || a.status === "todo" ? "skipped" : a.status
        agg.total++
        if (status === "passed") {
          agg.passed++
        } else if (status === "failed") {
          agg.failed++
        } else {
          agg.skipped++
        }
        tests.push({
          group,
          file,
          name: a.fullName || a.title || "(unnamed)",
          status,
          durationMs: a.duration ?? 0,
          error: status === "failed" ? firstErrorLine(a.failureMessages) : undefined,
        })
      }
    }

    shards.set(group, agg)
  }

  return { tests, shards }
}

// Platform gates (.ifMac/.ifWindows/.ifLinux) and the per-package-manager e2e matrix load the same
// test on every shard/OS/leg it is bin-packed into; it runs on the one that matches and reports
// "skipped" on the rest. Summing the per-shard skip counts therefore multi-counts a single logical
// test. Collapse by (file, test name) so the raw skip total splits into the parts that actually
// matter: distinct tests that never run on any shard (uniqueNeverRun) versus skip rows that are just
// the same test routed to — or re-counted on — another shard (routedSkips + dupNeverRun). The four
// fields partition the raw rows exactly: rawSkipped === uniqueNeverRun + dupNeverRun + routedSkips.
function computeSkipStats(tests: TestRow[]): SkipStats {
  // Join file+name on a NUL (U+0000) delimiter, written as a unicode escape so this source stays
  // text; a raw NUL byte makes git and editors treat the file as binary. NUL cannot appear in a
  // file path or test title, so distinct (file, name) pairs cannot collide on one key.
  const key = (t: TestRow) => `${t.file}\u0000${t.name}`

  const ranSomewhere = new Set<string>()
  for (const t of tests) {
    if (t.status === "passed" || t.status === "failed") {
      ranSomewhere.add(key(t))
    }
  }

  const neverRunSeen = new Set<string>()
  let rawSkipped = 0
  let routedSkips = 0
  let dupNeverRun = 0
  for (const t of tests) {
    if (t.status !== "skipped") {
      continue
    }
    rawSkipped++
    const k = key(t)
    if (ranSomewhere.has(k)) {
      routedSkips++
    } else if (neverRunSeen.has(k)) {
      dupNeverRun++
    } else {
      neverRunSeen.add(k)
    }
  }

  return { rawSkipped, uniqueNeverRun: neverRunSeen.size, routedSkips, dupNeverRun }
}

// ── rendering ───────────────────────────────────────────────────────────────

function asciiTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => (r[i] ?? "").length)))
  const fmtRow = (cells: string[]) => "  " + cells.map((c, i) => (c ?? "").padEnd(widths[i])).join("  ")
  const sep = "  " + widths.map(w => "-".repeat(w)).join("  ")
  return [fmtRow(headers), sep, ...rows.map(fmtRow)].join("\n")
}

function mdTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`
  const sep = `| ${headers.map(() => "---").join(" | ")} |`
  const body = rows.map(r => `| ${r.map(md).join(" | ")} |`).join("\n")
  return [head, sep, body].join("\n")
}

function main() {
  const { resultsDir } = parseArgs()
  const { tests, shards } = collect(resultsDir)

  if (tests.length === 0) {
    const msg = `No test reports found under '${resultsDir}'. Nothing to summarize.`
    console.log(msg)
    appendStepSummary(`## 🧪 Test Summary\n\n${msg}\n`)
    return
  }

  const shardRows = [...shards.values()].sort((a, b) => a.group.localeCompare(b.group))
  const totals = shardRows.reduce(
    (t, s) => {
      t.durationMs += s.durationMs
      t.total += s.total
      t.passed += s.passed
      t.failed += s.failed
      t.skipped += s.skipped
      return t
    },
    { durationMs: 0, total: 0, passed: 0, failed: 0, skipped: 0 }
  )

  const failed = tests.filter(t => t.status === "failed").sort((a, b) => a.group.localeCompare(b.group) || a.file.localeCompare(b.file))
  const slowest = [...tests].sort((a, b) => b.durationMs - a.durationMs).slice(0, 25)
  const byDuration = [...tests].sort((a, b) => b.durationMs - a.durationMs)
  const skips = computeSkipStats(tests)

  // ── console ──
  console.log("")
  console.log(`=== Test Summary === (${totals.total} tests across ${shardRows.length} shards)`)
  console.log(`  Passed: ${totals.passed}   Failed: ${totals.failed}   Skipped: ${totals.skipped}   Total duration: ${formatDuration(totals.durationMs)}`)
  if (totals.skipped > 0) {
    console.log("")
    console.log(`  Skip breakdown (per-shard skips multi-count platform/PM-gated tests that run on only one shard):`)
    console.log(`    ${skips.uniqueNeverRun} distinct test${skips.uniqueNeverRun === 1 ? "" : "s"} never run on any shard`)
    console.log(`    ${skips.routedSkips} skip row${skips.routedSkips === 1 ? "" : "s"} for tests that pass/fail on another shard/OS/PM`)
    if (skips.dupNeverRun > 0) {
      console.log(
        skips.dupNeverRun === 1
          ? `    1 skip row is an extra copy of a never-run test on another shard`
          : `    ${skips.dupNeverRun} skip rows are extra copies of those never-run tests on other shards`
      )
    }
    console.log(`    = ${skips.rawSkipped} total skip rows`)
  }
  console.log("")
  console.log("Per-shard durations:")
  console.log(
    asciiTable(
      ["Shard", "Tests", "Passed", "Failed", "Skipped", "Duration"],
      shardRows.map(s => [s.group, String(s.total), String(s.passed), String(s.failed), String(s.skipped), formatDuration(s.durationMs)])
    )
  )
  console.log("")
  if (failed.length > 0) {
    console.log(`Failed tests (${failed.length}):`)
    console.log(
      asciiTable(
        ["Shard", "File", "Test", "Error"],
        failed.map(t => [t.group, truncate(t.file, 45), truncate(t.name, 60), truncate(t.error ?? "", 70)])
      )
    )
  } else {
    console.log("✅ All tests passed.")
  }
  console.log("")
  console.log("Slowest tests:")
  console.log(
    asciiTable(
      ["Duration", "Shard", "Test"],
      slowest.map(t => [formatDuration(t.durationMs), t.group, truncate(`${t.file} › ${t.name}`, 80)])
    )
  )
  console.log("")

  // ── GitHub step summary ──
  const parts: string[] = []
  parts.push(`## 🧪 Test Summary`)
  parts.push("")
  const skippedBadge = totals.skipped > 0 ? `⏭️ **${totals.skipped}** skipped (**${skips.uniqueNeverRun}** unique)` : `⏭️ **0** skipped`
  parts.push(
    `**${totals.total}** tests · ✅ **${totals.passed}** passed · ❌ **${totals.failed}** failed · ${skippedBadge} · ⏱️ total **${formatDuration(totals.durationMs)}** across **${shardRows.length}** shards`
  )
  parts.push("")

  if (totals.skipped > 0) {
    parts.push(`### ⏭️ Skip breakdown`)
    parts.push("")
    parts.push(
      `Per-shard skips multi-count platform-gated (\`.ifMac\`/\`.ifWindows\`/\`.ifLinux\`) and per-package-manager tests that load on every shard but run on only one. The **${totals.skipped}** raw skip rows are really:`
    )
    parts.push("")
    parts.push(`- **${skips.uniqueNeverRun}** distinct tests never run on any shard`)
    parts.push(`- **${skips.routedSkips}** skip rows for tests that pass/fail on another shard/OS/PM`)
    if (skips.dupNeverRun > 0) {
      parts.push(
        skips.dupNeverRun === 1
          ? `- **1** skip row is an extra copy of a never-run test on another shard`
          : `- **${skips.dupNeverRun}** skip rows are extra copies of those never-run tests on other shards`
      )
    }
    parts.push("")
  }

  if (failed.length > 0) {
    parts.push(`### ❌ Failed tests (${failed.length})`)
    parts.push("")
    parts.push(
      mdTable(
        ["Shard", "File", "Test", "Error"],
        failed.map(t => [t.group, t.file, t.name, truncate(t.error ?? "", 160)])
      )
    )
    parts.push("")
  } else {
    parts.push(`### ✅ All ${totals.total} tests passed`)
    parts.push("")
  }

  parts.push(`### ⏱️ Per-shard durations`)
  parts.push("")
  parts.push(
    mdTable(
      ["Shard", "Tests", "Passed", "Failed", "Skipped", "Duration"],
      shardRows.map(s => [s.group, String(s.total), String(s.passed), String(s.failed), String(s.skipped), formatDuration(s.durationMs)])
    )
  )
  parts.push("")

  parts.push(`### 🐢 Slowest tests`)
  parts.push("")
  parts.push(
    mdTable(
      ["Duration", "Shard", "File", "Test"],
      slowest.map(t => [formatDuration(t.durationMs), t.group, t.file, t.name])
    )
  )
  parts.push("")

  const shown = byDuration.slice(0, MAX_PER_TEST_ROWS)
  const omitted = byDuration.length - shown.length
  parts.push(`<details><summary>📋 All ${byDuration.length} test durations${omitted > 0 ? ` (showing slowest ${shown.length})` : ""}</summary>`)
  parts.push("")
  parts.push(
    mdTable(
      ["Duration", "Status", "Shard", "File", "Test"],
      shown.map(t => [formatDuration(t.durationMs), t.status, t.group, t.file, t.name])
    )
  )
  if (omitted > 0) {
    parts.push("")
    parts.push(`_…and ${omitted} more not shown (step-summary size limit)._`)
  }
  parts.push("")
  parts.push(`</details>`)
  parts.push("")

  appendStepSummary(parts.join("\n"))
}

function appendStepSummary(markdown: string) {
  const file = process.env.GITHUB_STEP_SUMMARY
  if (!file) {
    return
  }
  try {
    fs.appendFileSync(file, markdown + "\n")
  } catch (err: any) {
    console.error(`[test-summary] Could not write GITHUB_STEP_SUMMARY: ${err.message}`)
  }
}

main()
