import { readFile } from "fs/promises"
import { homedir } from "os"
import * as path from "path"
import { statOrNull } from "./fs.js"
import { InvalidConfigurationError } from "./util.js"

/**
 * Decodes standard (RFC 4648) base64. Whitespace is ignored, so line-wrapped output and a trailing newline decode fine.
 * Returns null for anything that is not the canonical encoding of the bytes it decodes to: characters outside the standard
 * alphabet (quotes, URL-safe `-` and `_`), missing or misplaced `=` padding, a truncated value. Unlike
 * `Buffer.from(value, "base64")`, which skips invalid characters and stops at the first `=`, it never decodes garbage.
 */
export function decodeStrictBase64(value: string): Buffer | null {
  const compact = value.replace(/\s/g, "")
  const decoded = Buffer.from(compact, "base64")
  // the encoder only emits the canonical form, so the round trip holds exactly when `compact` is canonical base64
  return compact.length > 0 && decoded.toString("base64") === compact ? decoded : null
}

/**
 * Decodes a base64 CSC link to a Buffer, or returns null if the value is not base64 (i.e. a path). A value read as base64 —
 * a `data:…;base64,` prefix, longer than 2048 chars, or ending with `=` — must be valid standard base64.
 */
export function decodeCscLinkBase64(link: string): Buffer | null {
  const mimeMatch = /^data:.*;base64,/.exec(link)
  if (mimeMatch || link.length > 2048 || link.endsWith("=")) {
    const decoded = decodeStrictBase64(link.substring(mimeMatch?.[0].length ?? 0))
    if (decoded == null) {
      // never include the value: it is the certificate itself
      throw new InvalidConfigurationError(
        "The base64 value of CSC_LINK, WIN_CSC_LINK, CSC_INSTALLER_LINK, SNAP_CSC_LINK or a cscLink option is not valid standard base64 (the value is not shown): " +
          "only A-Z, a-z, 0-9, `+` and `/` with `=` padding are allowed, and line breaks are ignored. Check for surrounding quotes " +
          '(in cmd.exe, write `set "CSC_LINK=…"`, not `set CSC_LINK="…"`), stray characters, URL-safe base64 (`-` and `_`) or a truncated value, ' +
          "and re-encode the file on one line: `base64 < certificate.p12 | tr -d '\\n'` (macOS, Linux) or " +
          "`[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path certificate.p12)))` (PowerShell). " +
          "See https://www.electron.build/docs/features/code-signing#base64-certificate-values"
      )
    }
    return decoded
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
 * - Base64: detected by `data:…;base64,` prefix, length > 2048, or trailing `=`; must then be valid standard base64
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
