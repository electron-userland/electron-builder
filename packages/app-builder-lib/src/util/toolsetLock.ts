import { log } from "builder-util"
import { writeFile } from "fs/promises"
import * as lockfile from "proper-lockfile"
import * as os from "os"
import * as path from "path"

const TOOLSET_LOCK_FILE = path.join(os.tmpdir(), ".electron-builder-toolset.lock")
const SIGNTOOL_LOCK_FILE = path.join(os.tmpdir(), ".electron-builder-signtool.lock")
const ICONS_LOCK_FILE = path.join(os.tmpdir(), ".electron-builder-icons.lock")

/**
 * How long a caller waits for a lock another live process holds, retrying 1s, 2s and 4s apart, then every 5s. A holder keeps its lock for
 * as long as its task runs, and Squirrel.Windows and MSI hold the toolset lock for a whole installer build, which takes minutes: with
 * several queued (x64 and arm64 targets, or parallel builds sharing os.tmpdir()), the previous 100 retries (about 8 minutes) ran out while
 * live holders were still taking turns. The long wait cannot hang on a dead process: a live holder refreshes its lock every `stale / 2`
 * (60s), and the lock of one that died goes stale after `stale` (120s) and is taken over.
 * @internal
 */
export const LOCK_WAIT_MS = 60 * 60 * 1000

// Consecutive errors other than ELOCKED that are retried before the last one is rethrown (1s, 2s, 4s, 5s and 5s apart)
const OTHER_LOCK_ERROR_RETRIES = 5

/** @internal `waitMs` is a test seam; production uses {@link LOCK_WAIT_MS}. */
export async function withLock<T>(lockFile: string, task: () => Promise<T>, waitMs = LOCK_WAIT_MS): Promise<T> {
  await writeFile(lockFile, "", { flag: "a" })
  const start = Date.now()
  let release: () => Promise<void>
  // A lock that another process holds (ELOCKED) is waited out until the deadline. proper-lockfile retries every error of its own, so it
  // gets no retries, and any other error is retried only a few times in a row: on Windows, a lock directory that another process is
  // removing stays delete-pending while a handle is open, and mkdir or stat fails with EPERM, EACCES or EBUSY until it is gone, while a
  // lock that cannot be created at all (ENOSPC, EROFS, ENAMETOOLONG) still fails within half a minute instead of after the whole wait.
  let otherFailures = 0
  for (let delay = 1000; ; delay = Math.min(delay * 2, 5000)) {
    try {
      release = await lockfile.lock(lockFile, { stale: 120_000 })
      break
    } catch (e: any) {
      if (e?.code !== "ELOCKED") {
        if (++otherFailures > OTHER_LOCK_ERROR_RETRIES) {
          throw e
        }
      } else if (Date.now() - start >= waitMs) {
        // proper-lockfile's own message does not say which lock; the code stays ELOCKED for callers that match it
        throw Object.assign(
          new Error(`Timed out after ${Math.round((Date.now() - start) / 1000)}s waiting for the cross-process lock ${lockFile}, which another electron-builder process holds`),
          { code: "ELOCKED", cause: e }
        )
      } else {
        // the lock directory could be looked at, so a run of other errors starts over
        otherFailures = 0
      }
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  try {
    return await task()
  } finally {
    await release().catch((err: Error) => log.warn({ err }, "failed to release lock"))
  }
}

export function withToolsetLock<T>(task: () => Promise<T>): Promise<T> {
  return withLock(TOOLSET_LOCK_FILE, task)
}

// `signtool sign /f <pfx>` imports the PFX via PFXImportCertStore, which mutates the per-user
// CryptoAPI/CNG key+cert storage — a process-global resource that is not safe for concurrent access.
// winPackager already serializes signing within a single packager (signingQueue), but parallel builds
// (e.g. the test harness running multiple packagers across vitest workers that share one Windows user
// profile) race on that shared store and intermittently fail, after cert selection, with
// "SignTool Error: An error occurred while attempting to load the signing certificate". A dedicated
// cross-process lock (separate from the toolset lock so it does not block MSI/Squirrel builds)
// serializes signtool invocations. No-op overhead for real single builds, which are already serial.
export function withSigntoolLock<T>(task: () => Promise<T>): Promise<T> {
  return withLock(SIGNTOOL_LOCK_FILE, task)
}

// The icons toolset CLI (icon-tool.js) converts via a WebAssembly-backed image pipeline, and each
// invocation reserves a large `WebAssembly.Memory`. A single build converting one icon is fine, but
// parallel builds — most acutely the test harness running many packagers across forked vitest workers
// on one machine — spawn enough concurrent icon-tool processes to exhaust memory, failing with
// "WebAssembly.Memory(): could not allocate memory". A cross-process lock (separate from the toolset
// lock so it does not serialize against MSI/Squirrel/DMG builds) caps icon conversion at one at a
// time. No-op overhead for real single builds, which are already serial.
export function withIconsLock<T>(task: () => Promise<T>): Promise<T> {
  return withLock(ICONS_LOCK_FILE, task)
}
