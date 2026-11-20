import { createHash } from "crypto"
import { mkdir, rm, stat } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"

// A lock older than this is left over from a crashed worker and is taken over.
const STALE_LOCK_MS = 30 * 60 * 1000
const POLL_MS = 250

// Scoped to this checkout, like the heavy-test lock in vitest-heavy-mutex.ts, so runs from different checkouts don't wait on each other.
const projectHash = createHash("md5").update(process.cwd()).digest("hex").slice(0, 8)

export function crossProcessLockPath(name: string): string {
  return path.join(tmpdir(), `vitest-lock-${projectHash}-${name}`)
}

/**
 * Runs `task` while holding the named lock, which every vitest worker process of this checkout shares: for a machine-wide resource that
 * only some steps of a test touch, where marking the whole test heavy would serialize far more than needed. The lock is a directory,
 * because creating one is atomic on every platform.
 */
export async function withCrossProcessLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const lockPath = crossProcessLockPath(name)
  for (;;) {
    try {
      await mkdir(lockPath)
      break
    } catch (e: any) {
      if (e.code !== "EEXIST") {
        throw e
      }
    }
    const lockStat = await stat(lockPath).catch(() => null)
    if (lockStat != null && Date.now() - lockStat.mtimeMs > STALE_LOCK_MS) {
      await rm(lockPath, { recursive: true, force: true })
      continue
    }
    await new Promise(resolve => setTimeout(resolve, POLL_MS))
  }
  try {
    return await task()
  } finally {
    await rm(lockPath, { recursive: true, force: true })
  }
}

/**
 * Runs `task` while no other worker rewrites the user's keychain search list: createKeychain (macCodeSign.ts) reads the list and writes it
 * back with its temporary keychain added, and delete-keychain removes one, so two workers doing so at once can drop each other's keychain
 * and fail to find their identity. Every test that creates or removes a real keychain, or builds signed on macOS, takes this lock.
 */
export function withMacKeychainLock<T>(task: () => Promise<T>): Promise<T> {
  return withCrossProcessLock("mac-keychain", task)
}
