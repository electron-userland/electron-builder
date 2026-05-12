import { InvalidConfigurationError, statOrNull } from "builder-util"
import { outputFile, readFile } from "fs-extra"
import { homedir } from "os"
import * as path from "path"
import { TmpDir } from "temp-file"
import { download } from "../binDownload"

function resolveFilePath(cscLink: string, currentDir: string): string {
  if ((cscLink.length > 3 && cscLink[1] === ":") || cscLink.startsWith("/") || cscLink.startsWith(".")) {
    return path.resolve(currentDir, cscLink)
  } else if (cscLink.startsWith("file://")) {
    return path.resolve(currentDir, cscLink.substring("file://".length))
  } else if (cscLink.startsWith("~/")) {
    return path.join(homedir(), cscLink.substring("~/".length))
  }
  return path.resolve(currentDir, cscLink)
}

function decodeBase64CscLink(cscLink: string): Buffer | null {
  const mimeType = /data:.*;base64,/.exec(cscLink)?.[0]
  if (mimeType || cscLink.length > 2048 || cscLink.endsWith("=")) {
    return Buffer.from(cscLink.substring(mimeType?.length ?? 0), "base64")
  }
  return null
}

/** @private */
export async function importCertificate(cscLink: string, tmpDir: TmpDir, currentDir: string): Promise<string> {
  cscLink = cscLink.trim()

  if (cscLink.startsWith("https://")) {
    const tempFile = await tmpDir.getTempFile({ suffix: ".p12" })
    await download(cscLink, tempFile)
    return tempFile
  }

  const decoded = decodeBase64CscLink(cscLink)
  if (decoded) {
    const tempFile = await tmpDir.getTempFile({ suffix: ".p12" })
    await outputFile(tempFile, decoded)
    return tempFile
  }

  const file = resolveFilePath(cscLink, currentDir)
  const stat = await statOrNull(file)
  if (stat == null) {
    throw new InvalidConfigurationError(`${file} doesn't exist`)
  } else if (!stat.isFile()) {
    throw new InvalidConfigurationError(`${file} not a file`)
  } else {
    return file
  }
}

/**
 * Resolves a CSC link to its raw text content without writing anything to disk.
 * Accepts the same formats as {@link importCertificate}: base64-encoded data,
 * file paths (absolute, relative, `~/`, `file://`), and `~/`-prefixed paths.
 * HTTPS URLs are not supported — use {@link importCertificate} for those.
 *
 * Use this when you need the credential content in memory (e.g. to inject into
 * a subprocess environment variable) rather than a file path.
 */
export async function importCredentialContent(cscLink: string, currentDir: string): Promise<string> {
  cscLink = cscLink.trim()

  const decoded = decodeBase64CscLink(cscLink)
  if (decoded) {
    return decoded.toString("utf8")
  }

  const file = resolveFilePath(cscLink, currentDir)
  const stat = await statOrNull(file)
  if (stat == null) {
    throw new InvalidConfigurationError(`${file} doesn't exist`)
  } else if (!stat.isFile()) {
    throw new InvalidConfigurationError(`${file} not a file`)
  }
  return readFile(file, "utf8")
}
