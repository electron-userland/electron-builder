import * as path from "path"
import { getBinFromUrl } from "../binDownload"

export function getLinuxToolsPath() {
  return getBinFromUrl("linux-tools-mac-10.12.3", "linux-tools-mac-10.12.3.7z", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}

export async function getFpmPath() {
  if (process.env.CUSTOM_FPM_PATH != null) {
    return path.resolve(process.env.CUSTOM_FPM_PATH)
  }
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
    const fileName = "fpm-1.9.3-2.3.1-linux" + archSuffix
    return path.join(await getBinFromUrl(fileName, fileName + ".7z", checksum), exec)
  }
  return path.join(
    await getBinFromUrl(
      "fpm-1.9.3-20150715-2.2.2-mac",
      "fpm-1.9.3-20150715-2.2.2-mac.7z",
      "oXfq+0H2SbdrbMik07mYloAZ8uHrmf6IJk+Q3P1kwywuZnKTXSaaeZUJNlWoVpRDWNu537YxxpBQWuTcF+6xfw=="
    ),
    exec
  )
}
