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
 */

import { execSync, spawnSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { CACHE_FILE } from "./vitest-config/smart-config.js"

const REPO = "electron-userland/electron-builder"

function run(cmd: string): string {
  return execSync(cmd, { encoding: "utf8" }).trim()
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

function detectRef(): string {
  // Check for open PR for the current branch
  try {
    const branch = run("git rev-parse --abbrev-ref HEAD")
    const pr = run(`gh pr view --json number -q .number 2>/dev/null || echo ""`)
    if (pr) {
      return `PR-${pr}`
    }
    return branch
  } catch {
    return "master"
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

function main() {
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

  const cacheName = `vitest-smart-cache-${ref}`
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
      console.log(`Run 'pnpm ci:test:count' to preview the shard plan with timing data.`)
      return
    }
    console.log(`  Download failed.`)
  }

  console.log("No smart cache artifact found. Run 'pnpm ci:test:count' to see the default plan.")
}

main()
