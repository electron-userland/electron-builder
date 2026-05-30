import { closeSync, openSync, statSync, unlinkSync } from "fs"
import { createHash } from "crypto"
import { tmpdir } from "os"
import { join } from "path"
import { afterEach, beforeEach } from "vitest"

/**
 * Heavy test mutex - ensures tests marked as heavy run sequentially across
 * ALL Vitest worker processes (not just within a single worker).
 *
 * Uses a per-project file lock in tmpdir so that:
 *   - Workers in the same Vitest run serialize (cross-process mutex)
 *   - Runs from different project directories don't collide
 *   - Stale locks from crashed processes are automatically cleared
 *
 * This prevents resource contention when tests spawn exclusive processes like:
 * - hdiutil (macOS DMG creation)
 * - snap/snapcraft (Linux snap packages)
 * - rpmbuild (RPM packages)
 * - makensis / NSIS installer (Windows — shares a single Parallels VM mutex)
 */

// Scope the lock to this project directory so concurrent runs from different
// projects don't interfere with each other.
const projectHash = createHash("md5").update(process.cwd()).digest("hex").slice(0, 8)
const LOCK_FILE = join(tmpdir(), `vitest-heavy-${projectHash}.lock`)

// A lock file older than this is considered stale (from a previous crashed run).
const STALE_LOCK_MS = 30 * 60 * 1000 // 30 min

function tryAcquireFileLock(): boolean {
  // Remove stale lock if present
  try {
    const stat = statSync(LOCK_FILE)
    if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
      unlinkSync(LOCK_FILE)
    }
  } catch {
    // file doesn't exist — nothing to clean up
  }

  // Atomically create the lock file (O_CREAT | O_EXCL fails if it already exists)
  try {
    const fd = openSync(LOCK_FILE, "wx")
    closeSync(fd)
    return true
  } catch (e: any) {
    if (e.code !== "EEXIST") {
      throw e
    }
    return false
  }
}

function releaseFileLock(): void {
  try {
    unlinkSync(LOCK_FILE)
  } catch {
    // already released or never acquired
  }
}

// Release on process exit to avoid stale locks after crashes
process.on("exit", releaseFileLock)
process.on("SIGINT", () => {
  releaseFileLock()
  process.exit(130)
})
process.on("SIGTERM", () => {
  releaseFileLock()
  process.exit(143)
})

class HeavyTestMutex {
  // In-process queue: serializes tests within the same worker before they
  // even attempt the cross-process file lock.
  private queue: Array<() => void> = []
  private inProcessRunning = false
  private fileLockHeld = false

  async acquire(): Promise<void> {
    // 1. Acquire in-process slot (serialize within this worker)
    if (!this.inProcessRunning) {
      this.inProcessRunning = true
    } else {
      await new Promise<void>(resolve => {
        this.queue.push(resolve)
      })
    }

    // 2. Spin-wait on the cross-process file lock
    const deadline = Date.now() + 20 * 60 * 1000 // 20 min max wait
    while (Date.now() < deadline) {
      if (tryAcquireFileLock()) {
        this.fileLockHeld = true
        return
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Failed to get file lock — release in-process slot and throw
    this.releaseInProcess()
    throw new Error(`Heavy test mutex: timed out waiting for cross-process file lock (${LOCK_FILE})`)
  }

  release(): void {
    if (this.fileLockHeld) {
      releaseFileLock()
      this.fileLockHeld = false
    }
    this.releaseInProcess()
  }

  private releaseInProcess(): void {
    const next = this.queue.shift()
    if (next) {
      next()
    } else {
      this.inProcessRunning = false
    }
  }
}

const heavyMutex = new HeavyTestMutex()
const heavyContexts = new WeakSet<any>()

/** Returns true if the test task itself or any ancestor describe suite has meta.heavy = true. */
function isHeavy(task: any): boolean {
  if (task?.meta?.heavy === true) return true
  let suite = task?.suite
  while (suite) {
    if (suite.meta?.heavy === true) return true
    suite = suite.suite
  }
  return false
}

beforeEach(
  async ctx => {
    const task = (ctx as any).task
    if (!task) {
      return
    }
    // Check whether this test OR any ancestor describe suite carries the heavy flag.
    // describe.heavy(...) puts meta.heavy on the suite, not on individual test tasks,
    // so we must walk the suite chain rather than just checking task.meta.
    if (isHeavy(task)) {
      heavyContexts.add(ctx)
      // Acquire mutex — may wait for a long time if another heavy test is running.
      // The actual test timeout only starts once the mutex is acquired.
      await heavyMutex.acquire()
    }
  },
  // No timeout on the hook — the test timeout is separate
  Infinity
)

afterEach(
  ctx => {
    if (heavyContexts.has(ctx)) {
      heavyContexts.delete(ctx)
      heavyMutex.release()
    }
  },
  Infinity
)
