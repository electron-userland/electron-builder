#!/usr/bin/env ts-node
/**
 * Merges per-shard vitest smart cache artifacts into a single unified cache file.
 *
 * Each shard starts from the same base cache and updates only its own assigned files.
 * A naïve shallow merge would cause later shards to overwrite earlier shards' timing
 * data with stale zeros from the base. This script avoids that by merging per-file,
 * per-platform and keeping the record with the higher `runs` count — which is always
 * the shard that actually ran that file in this cycle.
 *
 * Windows reporters write cache keys with `\` separators. All keys are normalized to
 * `/` so every platform shares a single key namespace.
 *
 * Usage (CI — called from merge-smart-cache workflow step):
 *   ts-node test/vitest-scripts/merge-smart-cache.ts \
 *     --artifacts-dir smart-cache-artifacts \
 *     --output merged-cache/_vitest-smart-cache.json
 *
 * Usage (local — inspect what a merge would produce from downloaded artifacts):
 *   pnpm ci:test:merge-cache --artifacts-dir /tmp/my-artifacts --output /tmp/merged.json
 */

import * as fs from "fs"
import * as path from "path"

interface PlatformRun {
  runs: number
  fails: number
  avgMs: number
}

interface FileStats {
  unstable?: boolean
  hasHeavyTests?: boolean
  platformRuns?: Record<string, PlatformRun>
}

interface SmartCache {
  tests: Record<string, FileStats>
  files: Record<string, FileStats>
}

function normalizeKey(k: string): string {
  return k.replace(/\\/g, "/")
}

function mergePlatformRuns(
  existing: Record<string, PlatformRun> = {},
  incoming: Record<string, PlatformRun> = {}
): Record<string, PlatformRun> {
  const merged = { ...existing }
  for (const [platform, inPR] of Object.entries(incoming)) {
    const exPR = merged[platform]
    if (!exPR || inPR.runs > exPR.runs) {
      merged[platform] = inPR
    }
  }
  return merged
}

function mergeEntryMap(target: Record<string, FileStats>, source: Record<string, FileStats>): void {
  for (const [rawKey, incoming] of Object.entries(source)) {
    const key = normalizeKey(rawKey)
    const existing = target[key]
    if (!existing) {
      target[key] = incoming
    } else {
      target[key] = {
        ...existing,
        ...incoming,
        platformRuns: mergePlatformRuns(existing.platformRuns, incoming.platformRuns),
        hasHeavyTests: !!(existing.hasHeavyTests || incoming.hasHeavyTests),
      }
    }
  }
}

function parseArgs(): { artifactsDir: string; output: string } {
  const args = process.argv.slice(2)
  let artifactsDir = "smart-cache-artifacts"
  let output = "merged-cache/_vitest-smart-cache.json"
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--artifacts-dir" && args[i + 1]) artifactsDir = args[++i]
    else if (args[i] === "--output" && args[i + 1]) output = args[++i]
  }
  return { artifactsDir, output }
}

function main() {
  const { artifactsDir, output } = parseArgs()

  const mergedFiles: Record<string, FileStats> = {}
  const mergedTests: Record<string, FileStats> = {}
  let artifactsProcessed = 0

  if (!fs.existsSync(artifactsDir)) {
    console.log(`No artifacts directory found at '${artifactsDir}' — writing empty cache`)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, JSON.stringify({ tests: {}, files: {} }, null, 2))
    return
  }

  for (const artifact of fs.readdirSync(artifactsDir)) {
    const cacheFile = path.join(artifactsDir, artifact, "_vitest-smart-cache.json")
    if (!fs.existsSync(cacheFile)) continue
    console.log(`  Reading ${artifact}`)
    try {
      const cache: SmartCache = JSON.parse(fs.readFileSync(cacheFile, "utf8"))
      mergeEntryMap(mergedFiles, cache.files ?? {})
      mergeEntryMap(mergedTests, cache.tests ?? {})
      artifactsProcessed++
    } catch (err: any) {
      console.error(`  Error reading ${artifact}: ${err.message}`)
    }
  }

  const mergedCache = { tests: mergedTests, files: mergedFiles }
  const fileCount = Object.keys(mergedFiles).length
  const testCount = Object.keys(mergedTests).length
  console.log(`Processed ${artifactsProcessed} artifacts — Files: ${fileCount}, Tests: ${testCount}`)

  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(mergedCache, null, 2))
  console.log(`✓ Merged cache written to ${output}`)
}

main()
