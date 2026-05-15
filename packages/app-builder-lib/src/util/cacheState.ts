import { log } from "builder-util"
import * as fs from "fs/promises"
import * as path from "path"

export enum CacheState {
  pending = "pending",
  downloaded = "downloaded",
  extracting = "extracting",
  extracted = "extracted",
  complete = "complete",
  corrupted = "corrupted",
}

export interface CacheStateFile {
  version: number
  state: CacheState
  timestamp: number
  fileCount: number
  extractedSize: number
}

const STATE_FILE_VERSION = 1
const STALE_EXTRACTING_TIMEOUT_MS = 120000 // 120 seconds

function getStateFilePath(extractDir: string): string {
  return `${extractDir}.state`
}

export async function readCacheStateFile(extractDir: string): Promise<CacheStateFile | null> {
  const stateFile = getStateFilePath(extractDir)
  let content: string
  try {
    content = await fs.readFile(stateFile, "utf-8")
  } catch (e: any) {
    if (e.code !== "ENOENT") {
      log.warn({ stateFile, error: e.message }, "Failed to read cache state file")
    }
    return null
  }
  try {
    const data: CacheStateFile = JSON.parse(content)
    if (data.version !== STATE_FILE_VERSION) {
      log.warn({ stateFile, version: data.version, expected: STATE_FILE_VERSION }, "Cache state file version mismatch, ignoring")
      return null
    }
    if (data.state === CacheState.extracting) {
      const age = Date.now() - data.timestamp
      if (age > STALE_EXTRACTING_TIMEOUT_MS) {
        log.warn({ stateFile, age }, "Detected stale extracting state, marking as corrupted")
        return { ...data, state: CacheState.corrupted }
      }
    }
    return data
  } catch (e: any) {
    log.warn({ stateFile, error: e.message }, "Failed to parse cache state file")
    return null
  }
}

export async function writeCacheState(extractDir: string, state: CacheState, metadata?: { fileCount?: number; extractedSize?: number }, throwOnError = false): Promise<void> {
  const stateFile = getStateFilePath(extractDir)
  const stateData: CacheStateFile = {
    version: STATE_FILE_VERSION,
    state,
    timestamp: Date.now(),
    fileCount: metadata?.fileCount ?? 0,
    extractedSize: metadata?.extractedSize ?? 0,
  }

  try {
    await fs.writeFile(stateFile, JSON.stringify(stateData, null, 2), "utf-8")
  } catch (e: any) {
    log.warn({ stateFile, error: e.message }, "Failed to write cache state file")
    if (throwOnError) {
      throw e
    }
  }
}

export async function computeCacheMetadata(dir: string): Promise<{ fileCount: number; extractedSize: number }> {
  let fileCount = 0
  let extractedSize = 0
  const stack: string[] = [dir]
  while (stack.length > 0) {
    const current = stack.pop()!
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else {
        fileCount++
        if (entry.isFile()) {
          try {
            const stat = await fs.stat(fullPath)
            extractedSize += stat.size
          } catch {
            // ignore stat errors for individual files
          }
        }
      }
    }
  }
  return { fileCount, extractedSize }
}

export async function validateCacheDirectory(extractDir: string, expectedFileCount?: number): Promise<boolean> {
  try {
    const topLevel = await fs.readdir(extractDir)
    if (topLevel.length === 0) {
      return false
    }

    if (expectedFileCount != null && expectedFileCount > 0) {
      const { fileCount: actual } = await computeCacheMetadata(extractDir)
      if (actual !== expectedFileCount) {
        log.warn({ extractDir, expected: expectedFileCount, actual }, "Cache file count mismatch, treating as invalid")
        return false
      }
    }

    return true
  } catch (e: any) {
    log.warn({ extractDir, error: e.message }, "Failed to validate cache directory")
    return false
  }
}

export async function cleanupCacheDirectory(extractDir: string, { skipLockFiles = false } = {}): Promise<void> {
  const filesToClean = [extractDir, `${extractDir}.state`, `${extractDir}.tmp`, ...(!skipLockFiles ? [`${extractDir}.lock`, `${extractDir}.tmp.lock`] : [])]

  for (const file of filesToClean) {
    try {
      await fs.rm(file, { recursive: true, force: true })
    } catch (e: any) {
      log.warn({ file, error: e.message }, "Failed to clean up cache file")
    }
  }
}
