import { getCacheDirectory } from "app-builder-lib/out/util/electronGet"
import { log } from "builder-util"
import { access, constants, rm } from "fs/promises"
import { createInterface } from "readline/promises"
import * as path from "path"

export async function clearCache(): Promise<void> {
  const cacheDir = getCacheDirectory(false, false)

  if (cacheDir === path.parse(cacheDir).root) {
    log.error({ cacheDir }, "cache directory resolves to a filesystem root — aborting")
    return
  }

  try {
    await access(cacheDir, constants.F_OK | constants.W_OK)
  } catch (err: any) {
    if (err.code === "ENOENT") {
      log.info({ cacheDir }, "cache directory does not exist, nothing to clear")
    } else if (err.code === "EACCES" || err.code === "EPERM") {
      log.error({ cacheDir }, "cache directory is not writable")
    } else {
      throw err
    }
    return
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  let answer: string
  try {
    answer = await rl.question(`Clear cache at ${cacheDir}? [y/N] `)
  } finally {
    rl.close()
  }
  if (answer!.trim().toLowerCase() !== "y" && answer!.trim().toLowerCase() !== "yes") {
    log.info(null, "aborted")
    return
  }

  log.info({ cacheDir }, "clearing cache")
  await rm(cacheDir, { recursive: true })
  log.info({ cacheDir }, "cache cleared")
}
