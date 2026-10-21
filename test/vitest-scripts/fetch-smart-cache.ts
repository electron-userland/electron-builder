#!/usr/bin/env ts-node
/**
 * Fetches the latest vitest smart cache artifact from GitHub Actions so you can
 * inspect timing data locally without pushing to CI.
 *
 * Usage:
 *   ts-node test/vitest-scripts/fetch-smart-cache.ts          # auto-detect branch/PR
 *   ts-node test/vitest-scripts/fetch-smart-cache.ts --pr 123
 *   ts-node test/vitest-scripts/fetch-smart-cache.ts --ref master
 *
 * After fetching, run:
 *   pnpm ci:test:count
 *
 * CI usage:
 *   - VITEST_CACHE_REF (set by the pretest action) selects the ref, e.g. "PR-123" or "release-v26".
 *   - The shard planner (validate-and-shard) writes the exact source it restored to $GITHUB_OUTPUT as
 *     `source=<artifact-name>@<run-id>` (or `source=none`).
 *   - Shard jobs receive that value as VITEST_SMART_CACHE_SOURCE and restore exactly the same snapshot,
 *     so their in-job shard plan is identical to the matrix the planner produced. Resolving "the latest
 *     artifact" independently in every job is not deterministic: the artifact can be replaced mid-run.
 */

import { spawnSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { CACHE_FILE, parseSmartCacheSource } from "./vitest-config/smart-config.js"

const REPO = "electron-userland/electron-builder"

// Runs a command without a shell so behavior is identical on Windows (cmd.exe has no /dev/null and
// `echo ""` prints the quotes literally, which previously produced the bogus ref `PR-""`).
function run(cmd: string, args: string[]): string | null {
  const result = spawnSync(cmd, args, { encoding: "utf8" })
  if (result.status !== 0) {
    return null
  }
  return result.stdout.trim()
}

function ghJson(endpoint: string): any {
  const result = spawnSync("gh", ["api", endpoint], { encoding: "utf8" })
  if (result.status !== 0) {
    return null
  }
  try {
    return JSON.parse(result.stdout)
  } catch {
    return null
  }
}

// Artifact names cannot contain "/", so branch names like "release/v26" are
// uploaded as "release-v26". Mirror that sanitization here (keep in sync with
// the "Compute Vitest smart cache ref" steps in the CI workflows).
function sanitizeRef(ref: string): string {
  return ref.replace(/\//g, "-")
}

function detectRef(): string {
  // CI computes the ref once (PR number or sanitized branch name) and passes it in. Prefer it so every
  // job on every OS looks up the same artifact.
  const envRef = process.env.VITEST_CACHE_REF?.trim()
  if (envRef) {
    return envRef
  }

  // Local usage: check for an open PR for the current branch
  const pr = run("gh", ["pr", "view", "--json", "number", "-q", ".number"])
  if (pr && /^\d+$/.test(pr)) {
    return `PR-${pr}`
  }
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"])
  return branch && branch !== "HEAD" ? branch : "master"
}

function setGithubOutput(key: string, value: string) {
  const outputFile = process.env.GITHUB_OUTPUT
  if (outputFile) {
    fs.appendFileSync(outputFile, `${key}=${value}\n`)
  }
}

function downloadArtifact(runId: number, artifactName: string, dest: string): boolean {
  const tmpDir = path.join(path.dirname(dest), ".cache-download-tmp")
  fs.mkdirSync(tmpDir, { recursive: true })
  try {
    const result = spawnSync("gh", ["run", "download", String(runId), "--repo", REPO, "--name", artifactName, "--dir", tmpDir], { encoding: "utf8" })
    if (result.status !== 0) {
      return false
    }
    const downloaded = fs.readdirSync(tmpDir).find(f => f === "_vitest-smart-cache.json")
    if (!downloaded) {
      return false
    }
    fs.copyFileSync(path.join(tmpDir, downloaded), dest)
    return true
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

function findLatestArtifactRunId(artifactName: string): number | null {
  const data = ghJson(`repos/${REPO}/actions/artifacts?name=${artifactName}&per_page=30`)
  if (!data?.artifacts?.length) {
    return null
  }
  const live = (data.artifacts as any[]).filter((a: any) => !a.expired)
  if (!live.length) {
    return null
  }
  live.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return live[0].workflow_run.id ?? null
}

function summarize(dest: string) {
  const cache = JSON.parse(fs.readFileSync(dest, "utf8"))
  const files: Record<string, any> = cache.files ?? {}
  const platforms = ["linux", "win32", "darwin"] as const
  console.log(`\nCache summary (${Object.keys(files).length} files):`)
  for (const p of platforms) {
    const withData = Object.values(files).filter((f: any) => (f.platformRuns?.[p]?.avgMs ?? 0) > 0)
    console.log(`  ${p}: ${withData.length} files with timing data`)
  }
  console.log()
}

// Restores exactly the snapshot the shard planner used. Fails hard instead of falling back: a different
// cache yields a different shard plan, which either errors with "Shard index N is out of range" or
// silently skips/duplicates test files.
function restorePinnedSource(source: string, dest: string) {
  const parsed = parseSmartCacheSource(source)
  if (parsed.kind === "none") {
    console.log("Shard planner used no smart cache; not restoring one so the shard plan matches.")
    fs.rmSync(dest, { force: true })
    return
  }
  console.log(`Restoring smart cache pinned by the shard planner: ${parsed.name} from run ${parsed.runId}`)
  if (!downloadArtifact(parsed.runId, parsed.name, dest)) {
    throw new Error(`Failed to download pinned smart cache ${parsed.name} from run ${parsed.runId}`)
  }
  console.log(`✓ Restored ${parsed.name} → ${dest}`)
  summarize(dest)
}

function main() {
  const pinned = process.env.VITEST_SMART_CACHE_SOURCE?.trim()
  if (pinned) {
    restorePinnedSource(pinned, CACHE_FILE)
    return
  }

  const args = process.argv.slice(2)
  let ref: string | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--pr" && args[i + 1]) {
      ref = `PR-${args[++i]}`
    } else if (args[i] === "--ref" && args[i + 1]) {
      ref = args[++i]
    }
  }
  if (!ref) {
    ref = detectRef()
  }

  const cacheName = `vitest-smart-cache-${sanitizeRef(ref)}`
  const fallbackName = "vitest-smart-cache-master"
  const dest = CACHE_FILE

  for (const name of [cacheName, fallbackName]) {
    console.log(`Looking for artifact: ${name}`)
    const runId = findLatestArtifactRunId(name)
    if (!runId) {
      console.log(`  Not found.`)
      continue
    }
    console.log(`  Found in run ${runId}. Downloading...`)
    if (downloadArtifact(runId, name, dest)) {
      console.log(`✓ Restored ${name} → ${dest}`)
      summarize(dest)
      setGithubOutput("source", `${name}@${runId}`)
      console.log(`Run 'pnpm ci:test:count' to preview the shard plan with timing data.`)
      return
    }
    console.log(`  Download failed.`)
  }

  setGithubOutput("source", "none")
  console.log("No smart cache artifact found. Run 'pnpm ci:test:count' to see the default plan.")
}

main()
