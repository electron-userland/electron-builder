import * as path from "path"
import { getBinFromUrl } from "../binDownload"

export function getLinuxToolsPath() {
  //noinspection SpellCheckingInspection
  return getBinFromUrl("linux-tools", "mac-10.12.3", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}

export async function getFpmPath() {
  const exec = "fpm"
  if (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") {
    return exec
  }
  if (process.platform === "linux") {
    let checksum: string
    let archSuffix: string
    if (process.arch == "x64") {
      checksum = "fcKdXPJSso3xFs5JyIJHG1TfHIRTGDP0xhSBGZl7pPZlz4/TJ4rD/q3wtO/uaBBYeX0qFFQAFjgu1uJ6HLHghA=="
      archSuffix = "-x86_64"
    } else {
      checksum = "OnzvBdsHE5djcXcAT87rwbnZwS789ZAd2ehuIO42JWtBAHNzXKxV4o/24XFX5No4DJWGO2YSGQttW+zn7d/4rQ=="
      archSuffix = "-x86"
    }
    return path.join(await getBinFromUrl("fpm", "1.9.3-2.3.1-linux" + archSuffix, checksum), exec)
  }
  return path.join(await getBinFromUrl("fpm", "1.9.3-20150715-2.2.2-mac", "oXfq+0H2SbdrbMik07mYloAZ8uHrmf6IJk+Q3P1kwywuZnKTXSaaeZUJNlWoVpRDWNu537YxxpBQWuTcF+6xfw=="), exec)
}
