import { exists, sanitizeDirPath, validateSecuredUrl } from "builder-util"
import { mkdir, rmdir, stat } from "fs/promises"
import * as path from "path"
import { ToolsetCustom } from "../configuration.js"
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
  const key = JSON.stringify({ url: custom.url, checksum: custom.checksum ?? "", resourcesDir })
  let cached = _customToolsetCache.get(key)
  if (cached == null) {
    cached = _resolveCustomToolsetPath(custom, resourcesDir)
    _customToolsetCache.set(key, cached)
  }
  return cached
}

async function _resolveCustomToolsetPath(custom: ToolsetCustom, resourcesDir?: string): Promise<string> {
  const { type, toolset } = await validateCustomToolset(custom, resourcesDir)

  if (type === "directory") {
    return resolveFilePath(toolset.url, resourcesDir)
  }

  if (!toolset.checksum) {
    throw new Error(`ToolsetCustom.checksum is required for ${type} toolsets (url: ${toolset.url})`)
  }

  const binaryVersion = toolset.version ?? toolset.checksum.substring(0, 8)
  const releaseName = `${binaryVersion}-${hashUrlSafe(toolset.url)}`

  if (type === "url") {
    return downloadBuilderToolset({
      releaseName: releaseName,
      filenameWithExt: path.basename(toolset.url),
      checksums: { [path.basename(toolset.url)]: toolset.checksum },
      overrideUrl: toolset.url,
    })
  } else if (type === "file") {
    const cacheDir = await cacheDirectoryOverrideAllowed.value
    const customToolsetDir = path.join(cacheDir, "custom-toolsets")
    await mkdir(customToolsetDir, { recursive: true })

    // wipe first to ensure idempotent extraction if the source file changed since last extraction.
    // Contain the destination within customToolsetDir (mirrors the `url` branch): `version` is a free-form
    // config field, so a `../…` value must not let rmdir/extract escape the cache directory.
    const toolsetTarget = sanitizeDirPath(path.join(customToolsetDir, releaseName), customToolsetDir)
    if (await exists(toolsetTarget)) {
      await rmdir(toolsetTarget, { recursive: true })
    }
    await extractArchive(resolveFilePath(toolset.url, resourcesDir), toolsetTarget)
    return toolsetTarget
  }

  throw new Error(`Unsupported custom toolset type: ${type}`)
}
