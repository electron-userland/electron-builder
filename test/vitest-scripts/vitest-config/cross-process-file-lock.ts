import { randomBytes } from "crypto"
import { closeSync, openSync, readFileSync, statSync, unlinkSync, utimesSync, writeSync } from "fs"

/**
 * A lock file shared by processes: created exclusively, it holds the id of its owner, so only the owner removes it. The owner touches it
 * while holding it, so a lock nobody touched for `staleMs` is left over from a crashed process and is taken over.
 *
 * Every vitest worker process loads the heavy-test mutex (vitest-heavy-mutex.ts) and releases its lock when it exits; before the lock
 * had an owner, a worker exiting after a short file removed the lock of a heavy test running in another worker, and the next heavy test
 * started next to it.
 */
export class CrossProcessFileLock {
  private readonly owner = `${process.pid}-${randomBytes(8).toString("hex")}`
  private heartbeat: NodeJS.Timeout | null = null

  constructor(
    readonly file: string,
    private readonly staleMs = 5 * 60 * 1000,
    private readonly heartbeatMs = 30 * 1000
  ) {}

  tryAcquire(): boolean {
    try {
      if (Date.now() - statSync(this.file).mtimeMs > this.staleMs) {
        unlinkSync(this.file)
      }
    } catch {
      // no lock file — nothing to clean up
    }

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
    this.heartbeat = setInterval(() => {
      if (this.isHeld()) {
        const now = new Date()
        try {
          utimesSync(this.file, now, now)
        } catch {
          // released meanwhile
        }
      }
    }, this.heartbeatMs)
    this.heartbeat.unref()
    return true
  }

  /** Whether this instance holds the lock. */
  isHeld(): boolean {
    try {
      return readFileSync(this.file, "utf8") === this.owner
    } catch {
      return false
    }
  }

  /** Removes the lock if this instance holds it; a lock another process holds is left alone. */
  release(): void {
    if (this.heartbeat != null) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
    if (this.isHeld()) {
      try {
        unlinkSync(this.file)
      } catch {
        // already gone
      }
    }
  }
}
