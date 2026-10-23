import { exists, InvalidConfigurationError, sanitizeDirPath, validateSecuredUrl } from "builder-util"
import { mkdir, rm, stat } from "fs/promises"
import * as path from "path"
import { ToolsetCustom } from "../configuration.js"
import { ACCEPTED_CHECKSUM_FORMATS, checksumCacheKey, checksumMismatchMessage, ExpectedChecksum, parseChecksum, verifyFileChecksum } from "../util/checksum.js"
import { cacheDirectoryOverrideAllowed, downloadBuilderToolset, extractArchive, hashUrlSafe } from "../util/electronGet.js"

async function validateCustomToolset(custom: ToolsetCustom, resourcesDir?: string) {
  const url = custom.url.trim()
  try {
    const parsed = validateSecuredUrl(url)
    if (parsed.pathname.endsWith("/")) {
      throw new Error(`URL must point to a file, but got ${parsed.href}`)
    }
    return { toolset: custom, type: "url" }
  } catch {
    // Ignore. If the URL is invalid, validate it as a file path
  }
  if (url.startsWith("file://")) {
    const p = url.slice("file://".length)
    const isWithinResources = resourcesDir ? path.normalize(p).startsWith(path.normalize(resourcesDir + path.sep)) : false
    const isValid = path.isAbsolute(p) || isWithinResources
    const type =
      isValid &&
      (await exists(p)) &&
      (await stat(p)
        .then(s => (s.isDirectory() ? "directory" : s.isFile() ? "file" : false))
        .catch(() => false))
    if (type) {
      return { toolset: custom, type }
    }
  }
  throw new Error(`Invalid custom toolset: ${url}. Must be a valid https:// URL or a file:// path.`)
}

// Strip the file:// prefix and sanitize the path against resourcesDir (relative paths must be within it)
function resolveFilePath(url: string, resourcesDir?: string): string {
  const p = url.startsWith("file://") ? url.slice("file://".length) : url
  return path.isAbsolute(p) ? sanitizeDirPath(p) : sanitizeDirPath(p, resourcesDir)
}

const _customToolsetCache = new Map<string, Promise<string>>()

export function clearCustomToolsetCache(): void {
  _customToolsetCache.clear()
}

export function getCustomToolsetPath(custom: ToolsetCustom, resourcesDir?: string): Promise<string> {
  const key = JSON.stringify({ url: custom.url, checksum: memoChecksumKey(custom.checksum), resourcesDir })
  let cached = _customToolsetCache.get(key)
  if (cached == null) {
    cached = _resolveCustomToolsetPath(custom, resourcesDir)
    _customToolsetCache.set(key, cached)
  }
  return cached
}

// Equivalent spellings of one checksum (uppercase hex, surrounding whitespace) share a memo entry; an invalid value is
// keyed verbatim and fails in _resolveCustomToolsetPath with the configuration error.
function memoChecksumKey(checksum: string | undefined): string {
  if (!checksum) {
    return ""
  }
  try {
    return checksumCacheKey(parseChecksum(checksum, "ToolsetCustom.checksum"))
  } catch {
    return checksum
  }
}

const CHECKSUM_DOCS_URL = "https://www.electron.build/docs/toolsets#custom-toolset-checksum"

/**
 * Classifies the checksum of a downloaded or archive toolset up front, so a value in an unsupported format fails before
 * anything is downloaded or extracted, without echoing the value. A SHA-256 hex value is verified by `@electron/get` for a
 * download; a base64 SHA-512 (the format v26 used for all toolset checksums) is verified by electron-builder.
 */
function normalizeChecksum(checksum: string | undefined, type: string, url: string): ExpectedChecksum {
  if (!checksum) {
    throw new InvalidConfigurationError(`ToolsetCustom.checksum is required for ${type} toolsets (url: ${url}): ${ACCEPTED_CHECKSUM_FORMATS}. See ${CHECKSUM_DOCS_URL}`)
  }
  return parseChecksum(checksum, `ToolsetCustom.checksum for ${type} toolset ${url}`, CHECKSUM_DOCS_URL)
}

async function _resolveCustomToolsetPath(custom: ToolsetCustom, resourcesDir?: string): Promise<string> {
  const { type, toolset } = await validateCustomToolset(custom, resourcesDir)

  if (type === "directory") {
    return resolveFilePath(toolset.url, resourcesDir)
  }

  const checksum = normalizeChecksum(toolset.checksum, String(type), toolset.url)
  // hex form of the digest: a base64 SHA-512 may contain "/" or "+", which must not reach the cache directory name
  const binaryVersion = toolset.version ?? checksumCacheKey(checksum).substring(0, 8)
  const releaseName = `${binaryVersion}-${hashUrlSafe(toolset.url)}`

  if (type === "url") {
    return downloadBuilderToolset({
      releaseName: releaseName,
      filenameWithExt: path.basename(toolset.url),
      checksums: { [path.basename(toolset.url)]: checksum.value },
      overrideUrl: toolset.url,
    })
  } else if (type === "file") {
    const archivePath = resolveFilePath(toolset.url, resourcesDir)
    // Verify the local archive on every resolution, before anything is extracted: the archive is re-extracted each time anyway
    // (see below), so hashing it adds little, and a stale extraction can never outlive a changed archive. The user's file is
    // never modified or removed, whatever the result.
    const { matches, actual } = await verifyFileChecksum(archivePath, checksum)
    if (!matches) {
      throw new InvalidConfigurationError(
        `${checksumMismatchMessage(`the local toolset archive ${archivePath}`, checksum, actual)} ` +
          `The archive was not extracted and has been left in place. Update ToolsetCustom.checksum if the archive was changed intentionally. See ${CHECKSUM_DOCS_URL}`
      )
    }

    const cacheDir = await cacheDirectoryOverrideAllowed.value
    const customToolsetDir = path.join(cacheDir, "custom-toolsets")
    await mkdir(customToolsetDir, { recursive: true })

    // wipe first to ensure idempotent extraction if the source file changed since last extraction.
    // Contain the destination within customToolsetDir (mirrors the `url` branch): `version` is a free-form
    // config field, so a `../…` value must not let rmdir/extract escape the cache directory.
    const toolsetTarget = sanitizeDirPath(path.join(customToolsetDir, releaseName), customToolsetDir)
    if (await exists(toolsetTarget)) {
      await rm(toolsetTarget, { recursive: true })
    }
    await extractArchive(archivePath, toolsetTarget)
    return toolsetTarget
  }

  throw new Error(`Unsupported custom toolset type: ${type}`)
}
