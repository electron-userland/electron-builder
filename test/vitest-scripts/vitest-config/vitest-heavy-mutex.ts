import { createHash } from "crypto"
import { tmpdir } from "os"
import { join } from "path"
import { afterEach, beforeEach } from "vitest"
import { CrossProcessFileLock } from "./cross-process-file-lock"

/**
 * Heavy test mutex - ensures tests marked as heavy run sequentially across
 * ALL Vitest worker processes (not just within a single worker).
 *
 * Uses a per-project file lock in tmpdir so that:
 *   - Workers in the same Vitest run serialize (cross-process mutex)
 *   - Runs from different project directories don't collide
 *   - Only the holder removes the lock, and stale locks from crashed processes are automatically cleared
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

const fileLock = new CrossProcessFileLock(LOCK_FILE)

// Release on process exit to avoid stale locks after crashes (only a lock this process holds, see CrossProcessFileLock)
process.on("exit", () => fileLock.release())
process.on("SIGINT", () => {
  fileLock.release()
  process.exit(130)
})
process.on("SIGTERM", () => {
  fileLock.release()
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

    // 2. Spin-wait on the cross-process file lock. With several workers, a heavy test can queue behind the heavy tests of the others;
    // the job timeout bounds the wait, this only catches a lock that never frees.
    const deadline = Date.now() + 60 * 60 * 1000
    while (Date.now() < deadline) {
      if (fileLock.tryAcquire()) {
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
      fileLock.release()
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
      const waitStart = Date.now()
      await heavyMutex.acquire()
      // vitest counts beforeEach hooks in the test's duration; the smart reporter subtracts the wait so the cached duration is the
      // test's own (summed over retries, which run this hook again)
      task.meta.heavyWaitMs = (task.meta.heavyWaitMs ?? 0) + (Date.now() - waitStart)
    }
  },
  // No timeout on the hook — the test timeout is separate
  Infinity
)

afterEach(ctx => {
  if (heavyContexts.has(ctx)) {
    heavyContexts.delete(ctx)
    heavyMutex.release()
  }
}, Infinity)
