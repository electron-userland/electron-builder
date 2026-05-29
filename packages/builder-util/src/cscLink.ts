import { readFile } from "fs/promises"
import { homedir } from "os"
import * as path from "path"
import { statOrNull } from "./fs"

/** Decodes a base64 CSC link to a Buffer, or returns null if the value is not base64. */
export function decodeCscLinkBase64(link: string): Buffer | null {
  const mimeMatch = /^data:.*;base64,/.exec(link)
  if (mimeMatch || link.length > 2048 || link.endsWith("=")) {
    return Buffer.from(link.substring(mimeMatch?.[0].length ?? 0), "base64")
  }
  return null
}

/** Resolves a CSC link file path, expanding `~/`, `file://`, and relative paths against `cwd`. */
export function resolveCscLinkPath(cscLink: string, resourcesDir: string | undefined): string {
  let link = cscLink
  let baseDir = resourcesDir
  const filePrefix = "file://"

  if (link.startsWith("~/")) {
    baseDir = homedir()
    link = link.slice(2)
  } else if (cscLink.startsWith(filePrefix)) {
    link = cscLink.slice(filePrefix.length)
  }
  if (path.isAbsolute(link)) {
    return link
  }
  if (baseDir == null) {
    // No base directory to resolve relative path against
    throw new Error(`CSC link is a relative path but no resourcesDir provided: ${cscLink}`)
  }
  return path.resolve(baseDir, link)
}

/**
 * Resolves a CSC link to its text content.
 *
 * Formats accepted:
 * - Base64: detected by `data:…;base64,` prefix, length > 2048, or trailing `=`
 * - File path: `~/…`, `file://…`, absolute, or relative to `cwd`
 */
export async function loadCscLink(link: string, resourcesDir: string | undefined): Promise<string> {
  const trimmed = link.trim()

  const decoded = decodeCscLinkBase64(trimmed)
  if (decoded) {
    return decoded.toString("utf8")
  }

  const filePath = resolveCscLinkPath(trimmed, resourcesDir)
  const stat = await statOrNull(filePath)
  if (stat == null) {
    throw new Error(`${filePath} doesn't exist`)
  } else if (!stat.isFile()) {
    throw new Error(`${filePath} not a file`)
  }
  return readFile(filePath, "utf8")
}
