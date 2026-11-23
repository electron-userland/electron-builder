import { log } from "builder-util"
import { writeFile } from "fs/promises"
import * as lockfile from "proper-lockfile"
import * as os from "os"
import * as path from "path"

const TOOLSET_LOCK_FILE = path.join(os.tmpdir(), ".electron-builder-toolset.lock")
const SIGNTOOL_LOCK_FILE = path.join(os.tmpdir(), ".electron-builder-signtool.lock")
const ICONS_LOCK_FILE = path.join(os.tmpdir(), ".electron-builder-icons.lock")

/**
 * Retries a caller makes for a lock another live process holds: 1s, 2s and 4s apart, then every 5s, for about 60 minutes. A holder keeps
 * its lock for as long as its task runs, and Squirrel.Windows and MSI hold the toolset lock for a whole installer build, which takes
 * minutes: with several queued (x64 and arm64 targets, or parallel builds sharing os.tmpdir()), the previous 100 retries (about 8 minutes)
 * ran out while live holders were still taking turns. The long wait cannot hang on a dead process: a live holder refreshes its lock every
 * `stale / 2` (60s), and the lock of one that died goes stale after `stale` (120s) and is taken over.
 * @internal
 */
export const LOCK_WAIT_RETRIES = 3 + (60 * 60) / 5

/** @internal `retries` is a test seam; production uses {@link LOCK_WAIT_RETRIES}. */
export async function withLock<T>(lockFile: string, task: () => Promise<T>, retries = LOCK_WAIT_RETRIES): Promise<T> {
  await writeFile(lockFile, "", { flag: "a" })
  const start = Date.now()
  let release: () => Promise<void>
  try {
    release = await lockfile.lock(lockFile, {
      retries: { retries, minTimeout: 1000, maxTimeout: 5000 },
      stale: 120_000,
    })
  } catch (e: any) {
    if (e?.code === "ELOCKED") {
      // proper-lockfile's own message does not say which lock; the code stays ELOCKED for callers that match it
      throw Object.assign(
        new Error(`Timed out after ${Math.round((Date.now() - start) / 1000)}s waiting for the cross-process lock ${lockFile}, which another electron-builder process holds`),
        { code: "ELOCKED", cause: e }
      )
    }
    throw e
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
