import { randomBytes } from "crypto"
import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from "fs"
import { Worker } from "worker_threads"

// Touches the lock file while the owner holds it. A thread of its own, so it keeps touching while the test's thread is blocked in a long
// synchronous step (execFileSync of an installer, spawnSync of snapcraft); it ends with the process, so a crashed holder's lock goes stale.
const HEARTBEAT_SCRIPT = `
const { readFileSync, utimesSync } = require("fs")
const { workerData } = require("worker_threads")
setInterval(() => {
  try {
    if (readFileSync(workerData.file, "utf8") === workerData.owner) {
      const now = new Date()
      utimesSync(workerData.file, now, now)
    }
  } catch {
    // released meanwhile
  }
}, workerData.heartbeatMs)
`

// How long a takeover guard may be held: removing a stale lock takes milliseconds, so an older guard is left by a crashed process.
const STALE_GUARD_MS = 10 * 1000

function ageMs(file: string): number | null {
  try {
    return Date.now() - statSync(file).mtimeMs
  } catch {
    return null
  }
}

function readOwner(file: string): string | null {
  try {
    return readFileSync(file, "utf8")
  } catch {
    return null
  }
}

function unlinkIfExists(file: string): void {
  try {
    unlinkSync(file)
  } catch {
    // already gone
  }
}

/**
 * A lock file shared by processes: created exclusively, it holds the id of its owner, so only the owner removes it. While the owner holds
 * it, a heartbeat thread touches it, so a lock nobody touched for `staleMs` is left over from a crashed process and is taken over.
 *
 * Every vitest worker process loads the heavy-test mutex (vitest-heavy-mutex.ts) and releases its lock when it exits; before the lock
 * had an owner, a worker exiting after a short file removed the lock of a heavy test running in another worker, and the next heavy test
 * started next to it.
 */
export class CrossProcessFileLock {
  private readonly owner = `${process.pid}-${randomBytes(8).toString("hex")}`
  private heartbeat: Worker | null = null

  constructor(
    readonly file: string,
    private readonly staleMs = 5 * 60 * 1000,
    private readonly heartbeatMs = 30 * 1000
  ) {}

  tryAcquire(): boolean {
    this.removeIfStale()

    let fd: number
    try {
      // atomically: O_CREAT | O_EXCL fails if the file already exists
      fd = openSync(this.file, "wx")
    } catch (e: any) {
      if (e.code !== "EEXIST") {
        throw e
      }
      return false
    }
    try {
      writeSync(fd, this.owner)
    } finally {
      closeSync(fd)
    }
    this.heartbeat = new Worker(HEARTBEAT_SCRIPT, { eval: true, workerData: { file: this.file, owner: this.owner, heartbeatMs: this.heartbeatMs } })
    this.heartbeat.unref()
    return true
  }

  /** Whether this instance holds the lock. */
  isHeld(): boolean {
    return readOwner(this.file) === this.owner
  }

  /** Removes the lock if this instance holds it; a lock another process holds is left alone. */
  release(): void {
    if (this.heartbeat != null) {
      void this.heartbeat.terminate()
      this.heartbeat = null
    }
    if (this.isHeld()) {
      unlinkIfExists(this.file)
    }
  }

  /**
   * Removes a stale lock. Takeover is guarded: two waiters that both see the stale lock must not both remove a lock, or the second one
   * would remove the lock the first one has taken in the meantime. Only the waiter that creates the guard removes the lock, and only if
   * it is still the stale lock it saw (same owner, still untouched).
   */
  private removeIfStale(): void {
    const age = ageMs(this.file)
    if (age == null || age <= this.staleMs) {
      return
    }
    const staleOwner = readOwner(this.file)
    const guard = `${this.file}.takeover`
    const guardAge = ageMs(guard)
    if (guardAge != null && guardAge > STALE_GUARD_MS) {
      unlinkIfExists(guard)
    }
    let fd: number
    try {
      fd = openSync(guard, "wx")
    } catch {
      // another waiter is taking over
      return
    }
    closeSync(fd)
    try {
      const currentAge = ageMs(this.file)
      if (currentAge != null && currentAge > this.staleMs && readOwner(this.file) === staleOwner) {
        unlinkIfExists(this.file)
      }
    } finally {
      unlinkIfExists(guard)
    }
  }
}
