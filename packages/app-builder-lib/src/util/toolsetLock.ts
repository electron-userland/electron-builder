import { log } from "builder-util"
import { writeFile } from "fs/promises"
import * as lockfile from "proper-lockfile"
import * as os from "os"
import * as path from "path"

const LOCK_FILE = path.join(os.tmpdir(), ".electron-builder-toolset.lock")

export async function withToolsetLock<T>(task: () => Promise<T>): Promise<T> {
  await writeFile(LOCK_FILE, "", { flag: "a" })
  const release = await lockfile.lock(LOCK_FILE, {
    retries: { retries: 100, minTimeout: 1000, maxTimeout: 5000 },
    stale: 120_000,
  })
  try {
    return await task()
  } finally {
    await release().catch((err: Error) => log.warn({ err }, "failed to release toolset lock"))
  }
}
