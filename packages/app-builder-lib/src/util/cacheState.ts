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

export async function readCacheState(extractDir: string): Promise<CacheState | null> {
  const stateFile = getStateFilePath(extractDir)
  try {
    if (!(await exists(stateFile))) {
      // Check for legacy .complete marker for backward compatibility
      if (await exists(`${extractDir}.complete`)) {
        return CacheState.complete
      }
      return CacheState.pending
    }

    const content = await fs.readFile(stateFile, "utf-8")
    const data: CacheStateFile = JSON.parse(content)
    let state = data.state as CacheState

    // Detect stale extracting state (process likely crashed)
    if (state === CacheState.extracting) {
      const age = Date.now() - data.timestamp
      if (age > STALE_EXTRACTING_TIMEOUT_MS) {
        log.warn({ stateFile, age }, "Detected stale extracting state, marking as corrupted")
        return CacheState.corrupted
      }
    }

    return state
  } catch (e: any) {
    log.warn({ stateFile, error: e.message }, "Failed to read cache state file")
    return CacheState.pending
  }
}

export async function writeCacheState(
  extractDir: string,
  state: CacheState,
  metadata?: { fileCount?: number; extractedSize?: number }
): Promise<void> {
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

export async function validateCacheDirectory(extractDir: string): Promise<boolean> {
  try {
    if (!(await exists(extractDir))) {
      return false
    }

    const files = await fs.readdir(extractDir)
    if (files.length === 0) {
      return false
    }

    // For 7z/WiX extractions, verify we have both executables and DLLs
    const hasExe = files.some(f => f.toLowerCase().endsWith(".exe"))
    const hasDlls = files.some(f => f.toLowerCase().endsWith(".dll"))

    // If it looks like a 7z extraction (has .exe), it should also have DLLs
    if (hasExe && !hasDlls) {
      log.warn({ extractDir, files: files.length }, "Incomplete extraction: exe present but no DLLs")
      return false
    }

    return true
  } catch (e: any) {
    log.warn({ extractDir, error: e.message }, "Failed to validate cache directory")
    return false
  }
}

export async function cleanupCacheDirectory(extractDir: string): Promise<void> {
  const filesToClean = [
    extractDir,
    `${extractDir}.state`,
    `${extractDir}.complete`,
    `${extractDir}.tmp`,
  ]

  for (const file of filesToClean) {
    try {
      await fs.rm(file, { recursive: true, force: true })
    } catch (e: any) {
      log.warn({ file, error: e.message }, "Failed to clean up cache file")
    }
  }
}
