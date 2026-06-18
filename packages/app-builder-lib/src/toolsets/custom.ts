import { exec, exists, log, sanitizeDirPath, to7zaOutputSwitch, validateSecuredUrl } from "builder-util"
import { createReadStream, createWriteStream } from "fs"
import * as fs from "fs/promises"
import { mkdir, rmdir, stat } from "fs/promises"
import * as path from "path"
import * as lockfile from "proper-lockfile"
import { pipeline } from "stream/promises"
import * as tar from "tar"
import * as unzipper from "unzipper"
import { ToolsetCustom } from "../configuration.js"
import { downloadBuilderToolset, getCacheDirectory } from "../util/electronGet.js"
import { getPath7za } from "./7zip.js"

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
    const cacheDir = getCacheDirectory({ isAvoidSystemOnWindows: true, allowEnvVarOverride: true })
    const customToolsetDir = path.join(cacheDir, "custom-toolsets")
    await mkdir(customToolsetDir, { recursive: true })

    // wipe first to ensure idempotent extraction if the source file changed since last extraction
    const toolsetTarget = path.join(customToolsetDir, releaseName)
    if (await exists(toolsetTarget)) {
      await rmdir(toolsetTarget, { recursive: true })
    }
    await extractArchive(resolveFilePath(toolset.url, resourcesDir), toolsetTarget)
    return toolsetTarget
  }

  throw new Error(`Unsupported custom toolset type: ${type}`)
}

export function hashUrlSafe(input: string, length = 6): string {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i)
  }
  hash >>>= 0
  const out = hash.toString(36)
  return out.length >= length ? out.slice(0, length) : out.padStart(length, "0")
}

async function extractZipStreaming(file: string, dir: string): Promise<void> {
  // Pass 1: read central directory once to collect Unix modes (one seek to EOF)
  const zipDir = await unzipper.Open.file(file)
  const entryModes = new Map<string, number>()
  for (const entry of zipDir.files) {
    const mode = (entry.externalFileAttributes >> 16) & 0xffff
    if (mode > 0) {
      entryModes.set(entry.path, mode)
    }
  }
  const isSymlink = (mode: number) => (mode & 0o170000) === 0o120000

  // Pass 2: stream from byte 0 — no per-entry seeks, no Docker hang
  const entries = createReadStream(file).pipe(unzipper.Parse({ forceStream: true }))
  for await (const entry of entries as AsyncIterable<unzipper.Entry>) {
    const destPath = path.resolve(dir, entry.path)
    if (!destPath.startsWith(dir + path.sep) && destPath !== dir) {
      throw new Error(`Path traversal blocked: ${entry.path}`)
    }
    const mode = entryModes.get(entry.path) ?? 0
    if (mode > 0 && isSymlink(mode)) {
      const target = (await entry.buffer()).toString()
      if (path.isAbsolute(target)) {
        throw new Error(`Absolute symlink target blocked: ${target}`)
      }
      const resolvedTarget = path.resolve(path.dirname(destPath), target)
      if (!resolvedTarget.startsWith(dir + path.sep) && resolvedTarget !== dir) {
        throw new Error(`Symlink target escapes extraction dir: ${target}`)
      }
      await fs.mkdir(path.dirname(destPath), { recursive: true })
      await fs.symlink(target, destPath)
    } else if (entry.type === "Directory") {
      await fs.mkdir(destPath, { recursive: true })
      entry.autodrain()
    } else {
      await fs.mkdir(path.dirname(destPath), { recursive: true })
      await pipeline(entry, createWriteStream(destPath))
      if (mode > 0) {
        await fs.chmod(destPath, mode & 0o7777)
      }
    }
  }
}

export async function extractArchive(file: string, dir: string) {
  const tmpDir = `${dir}.tmp`
  await fs.mkdir(tmpDir, { recursive: true })

  const release = await lockfile.lock(tmpDir, {
    retries: { retries: 100, minTimeout: 1000, maxTimeout: 5000 },
    stale: 120000,
  })

  try {
    await fs.rm(tmpDir, { recursive: true, force: true })
    await fs.mkdir(tmpDir, { recursive: true })

    // Guard against transient window in @electron/get's non-atomic putFileInCache (remove → move).
    for (let i = 0; !(await exists(file)); i++) {
      if (i >= 4) {
        throw Object.assign(new Error(`Source archive not found after retries: ${file}`), { code: "ENOENT", path: file })
      }
      log.warn({ file, attempt: i + 1 }, "source archive transiently missing, retrying")
      await new Promise(r => setTimeout(r, 300 * (i + 1)))
    }

    if (file.endsWith(".tar.gz") || file.endsWith(".tgz")) {
      await tar.extract({ file, cwd: tmpDir, strip: 1 })
    } else if (file.endsWith(".tar.xz") || file.endsWith(".txz")) {
      const cmd7za = await getPath7za()
      const xzOutDir = `${tmpDir}.xz`
      await fs.rm(xzOutDir, { recursive: true, force: true })
      await fs.mkdir(xzOutDir, { recursive: true })
      try {
        await exec(cmd7za, ["x", "-bd", file, to7zaOutputSwitch(sanitizeDirPath(xzOutDir)), "-y"])
        const innerTar = (await fs.readdir(xzOutDir)).find(f => f.endsWith(".tar"))
        if (innerTar == null) {
          throw new Error(`xz decompression of ${path.basename(file)} produced no .tar archive`)
        }
        await tar.extract({ file: path.join(xzOutDir, innerTar), cwd: tmpDir, strip: 1 })
      } finally {
        await fs.rm(xzOutDir, { recursive: true, force: true })
      }
    } else if (file.endsWith(".zip")) {
      await extractZipStreaming(file, tmpDir)
    } else if (file.endsWith(".7z")) {
      const cmd7za = await getPath7za()
      try {
        await exec(cmd7za, ["x", "-bd", file, to7zaOutputSwitch(sanitizeDirPath(tmpDir)), "-y"])
      } catch (e: any) {
        const files = await fs.readdir(tmpDir)
        if (files.length === 0) {
          log.warn({ file, tmpDir, error: e.message }, "7z extraction produced no output")
          throw new Error(`7z extraction failed for ${file}: ${e.message}`)
        }
        log.warn({ error: e.message, filesExtracted: files.length }, "7z reported error but extracted files")
      }
    } else {
      throw new Error(`Unsupported archive format: ${path.basename(file)}`)
    }

    const extractedFiles = await fs.readdir(tmpDir)
    if (extractedFiles.length === 0) {
      throw new Error(`Extraction of ${path.basename(file)} produced no files`)
    }

    await fs.rm(dir, { recursive: true, force: true })
    await fs.rename(tmpDir, dir)
  } finally {
    await release().catch(err => log.warn({ err }, "failed to release lockfile"))
  }
}
