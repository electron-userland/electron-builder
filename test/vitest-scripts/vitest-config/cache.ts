import * as fs from "fs"
import * as path from "path"
import { TestSpecification } from "vitest/node"
import { CACHE_FILE, SMART_REPORTER_VERBOSE, SupportedPlatforms } from "./smart-config.js"
import { TEST_SRC_ROOT } from "./vitest-smart-reporter.js"

// Informational cache chatter is opt-in (see SMART_REPORTER_VERBOSE); real errors below
// still use console.error unconditionally.
const logv = (...args: unknown[]) => {
  if (SMART_REPORTER_VERBOSE) {
    console.log(...args)
  }
}

export interface TestStats {
  platformRuns?: Record<
    SupportedPlatforms,
    {
      runs: number
      fails: number
      avgMs: number
    }
  >
  heavy?: boolean
}

export interface FileStats {
  unstable?: boolean
  hasHeavyTests?: boolean
  platformRuns?: Record<
    SupportedPlatforms,
    {
      runs: number
      fails: number
      avgMs: number
    }
  >
}

interface SmartCache {
  tests: Record<string, TestStats>
  files: Record<string, FileStats>
}

export function loadCache(): SmartCache {
  // Hard reset: when RESET_VITEST_SHARD_CACHE is set we ignore any cache on disk entirely, so
  // shard planning (smart-shard-count.ts), shard selection (run-vitest.ts) and the reporter all
  // start from zero timing data. Gating the fetch step in CI avoids downloading the artifact, but
  // this guard is what guarantees a stale/leftover cache file can never leak into a reset run.
  if (process.env.RESET_VITEST_SHARD_CACHE === "true") {
    logv(`[loadCache] RESET_VITEST_SHARD_CACHE=true — ignoring any existing cache, starting fresh`)
    return { tests: {}, files: {} }
  }

  // Check if file exists BEFORE trying to read it
  if (!fs.existsSync(CACHE_FILE)) {
    logv(`[loadCache] Cache file does not exist, starting fresh`)
    return { tests: {}, files: {} }
  }

  try {
    const content = fs.readFileSync(CACHE_FILE, "utf8")
    const cache = JSON.parse(content)

    const testCount = Object.keys(cache.tests || {}).length
    const fileCount = Object.keys(cache.files || {}).length
    logv(`[loadCache] ✓ Loaded cache - Tests: ${testCount}, Files: ${fileCount}`)

    return cache
  } catch (err: any) {
    console.error(`[loadCache] ✗ Error reading/parsing cache:`, err.message)
    console.error(`[loadCache] Starting with fresh cache`)
    return { tests: {}, files: {} }
  }
}

export function saveCache(cache: SmartCache) {
  const testCount = Object.keys(cache.tests || {}).length
  const fileCount = Object.keys(cache.files || {}).length

  logv(`[saveCache] Saving cache - Tests: ${testCount}, Files: ${fileCount}`)
  logv(`[saveCache] Target: ${CACHE_FILE}`)

  // Ensure directory exists
  const dir = path.dirname(CACHE_FILE)
  if (!fs.existsSync(dir)) {
    logv(`[saveCache] Creating directory: ${dir}`)
    fs.mkdirSync(dir, { recursive: true })
  }

  try {
    // Write to temp file first for atomic write
    const tempFile = `${CACHE_FILE}.tmp`
    const content = JSON.stringify(cache, null, 2)

    fs.writeFileSync(tempFile, content, "utf8")
    fs.renameSync(tempFile, CACHE_FILE)

    logv(`[saveCache] ✓ Cache saved successfully (${(content.length / 1024).toFixed(2)} KB)`)
  } catch (err: any) {
    console.error(`[saveCache] ✗ Error saving cache:`, err.message)
    throw err
  }
}

export function getFileStats(cache: SmartCache, f: TestSpecification) {
  const file = path.relative(TEST_SRC_ROOT, f.moduleId).split(path.sep).join("/")
  const stat = cache.files[file]
  return { stat, file }
}
