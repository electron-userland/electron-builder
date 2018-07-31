import { getBin, getBinFromGithub } from "../binDownload"
import { Lazy } from "lazy-val"
import * as path from "path"

export function getLinuxToolsPath() {
  //noinspection SpellCheckingInspection
  return getBinFromGithub("linux-tools", "mac-10.12.3", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}

export const fpmPath = new Lazy(() => {
  if (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") {
    return Promise.resolve("fpm")
  }

  return getBin("fpm", "fpm", null)
    .then(it => path.join(it, "fpm"))
})

// noinspection JSUnusedGlobalSymbols
export function prefetchBuildTools(): Promise<any> {
  // yes, we starting to use native Promise
  return fpmPath.value
}