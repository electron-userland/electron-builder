import * as fs from "fs"
import * as path from "path"
import { CACHE_FILE, SupportedPlatforms } from "./smart-config"

export interface TestStats {
  runs: number
  fails: number
  avgMs: number
  slow?: boolean
  heavy?: boolean
}

export interface FileStats {
  runs: number
  fails: number
  avgMs: number
  unstable?: boolean
  flaky?: boolean
  hasHeavyTests?: boolean
  platformAvgMs?: Record<SupportedPlatforms, number>
  platformRuns?: Record<SupportedPlatforms, number>
}

interface SmartCache {
  tests: Record<string, TestStats>
  files: Record<string, FileStats>
}

export function loadCache(): SmartCache {
  // Check if file exists BEFORE trying to read it
  if (!fs.existsSync(CACHE_FILE)) {
    console.log(`[loadCache] Cache file does not exist, starting fresh`)
    return { tests: {}, files: {} }
  }

  try {
    const content = fs.readFileSync(CACHE_FILE, "utf8")
    const cache = JSON.parse(content)

    const testCount = Object.keys(cache.tests || {}).length
    const fileCount = Object.keys(cache.files || {}).length
    console.log(`[loadCache] ✓ Loaded cache - Tests: ${testCount}, Files: ${fileCount}`)

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

  console.log(`[saveCache] Saving cache - Tests: ${testCount}, Files: ${fileCount}`)
  console.log(`[saveCache] Target: ${CACHE_FILE}`)

  // Ensure directory exists
  const dir = path.dirname(CACHE_FILE)
  if (!fs.existsSync(dir)) {
    console.log(`[saveCache] Creating directory: ${dir}`)
    fs.mkdirSync(dir, { recursive: true })
  }

  try {
    // Write to temp file first for atomic write
    const tempFile = `${CACHE_FILE}.tmp`
    const content = JSON.stringify(cache, null, 2)

    fs.writeFileSync(tempFile, content, "utf8")
    fs.renameSync(tempFile, CACHE_FILE)

    console.log(`[saveCache] ✓ Cache saved successfully (${content.length} bytes)`)
  } catch (err: any) {
    console.error(`[saveCache] ✗ Error saving cache:`, err.message)
    throw err
  }
}
