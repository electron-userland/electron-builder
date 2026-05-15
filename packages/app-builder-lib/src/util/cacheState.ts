import { log } from "builder-util"
import { exists } from "builder-util"
import * as fs from "fs/promises"

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
  try {
    if (!(await exists(stateFile))) {
      return null
    }
    const content = await fs.readFile(stateFile, "utf-8")
    const data: CacheStateFile = JSON.parse(content)
    if (data.state === CacheState.extracting) {
      const age = Date.now() - data.timestamp
      if (age > STALE_EXTRACTING_TIMEOUT_MS) {
        log.warn({ stateFile, age }, "Detected stale extracting state, marking as corrupted")
        return { ...data, state: CacheState.corrupted }
      }
    }
    return data
  } catch (e: any) {
    log.warn({ stateFile, error: e.message }, "Failed to read cache state file")
    return null
  }
}

export async function readCacheState(extractDir: string): Promise<CacheState> {
  const data = await readCacheStateFile(extractDir)
  return data?.state ?? CacheState.pending
}

export async function writeCacheState(extractDir: string, state: CacheState, metadata?: { fileCount?: number; extractedSize?: number }): Promise<void> {
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
  }
}

export async function validateCacheDirectory(extractDir: string, expectedFileCount?: number): Promise<boolean> {
  try {
    if (!(await exists(extractDir))) {
      return false
    }

    const files = await fs.readdir(extractDir)
    if (files.length === 0) {
      return false
    }

    if (expectedFileCount && files.length !== expectedFileCount) {
      log.warn({ extractDir, expected: expectedFileCount, actual: files.length }, "Cache file count mismatch, treating as invalid")
      return false
    }

    return true
  } catch (e: any) {
    log.warn({ extractDir, error: e.message }, "Failed to validate cache directory")
    return false
  }
}

export async function cleanupCacheDirectory(extractDir: string): Promise<void> {
  const filesToClean = [extractDir, `${extractDir}.state`, `${extractDir}.tmp`]

  for (const file of filesToClean) {
    try {
      await fs.rm(file, { recursive: true, force: true })
    } catch (e: any) {
      log.warn({ file, error: e.message }, "Failed to clean up cache file")
    }
  }
}
