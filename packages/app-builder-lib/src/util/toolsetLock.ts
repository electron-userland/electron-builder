import { log } from "builder-util"
import { writeFile } from "fs/promises"
import * as lockfile from "proper-lockfile"
import * as os from "os"
import * as path from "path"

const TOOLSET_LOCK_FILE = path.join(os.tmpdir(), ".electron-builder-toolset.lock")
const SIGNTOOL_LOCK_FILE = path.join(os.tmpdir(), ".electron-builder-signtool.lock")

async function withLock<T>(lockFile: string, task: () => Promise<T>): Promise<T> {
  await writeFile(lockFile, "", { flag: "a" })
  const release = await lockfile.lock(lockFile, {
    retries: { retries: 100, minTimeout: 1000, maxTimeout: 5000 },
    stale: 120_000,
  })
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
