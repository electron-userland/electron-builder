import * as get from "@electron/get"
import { ElectronDownloadCacheMode, ElectronDownloadRequest, ElectronDownloadRequestOptions, GotDownloaderOptions } from "@electron/get"
import { executeAppBuilder, exists, log, PADDING } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { sanitizeFileName } from "builder-util/out/filename"
import { MultiProgress } from "electron-publish/out/multiProgress"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import * as lockfile from "proper-lockfile"
import * as tar from "tar"
import { WriteStream as TtyWriteStream } from "tty"

/**
 * Deterministic <length>-character URL-safe hash (a–z0–9)
 */
export function hashUrlSafe(input: string, length = 6): string {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i) // hash * 33 ^ c
  }
  // Force unsigned 32-bit
  hash >>>= 0
  // Base-36 (0–9a–z)
  const out = hash.toString(36)
  // Ensure exactly `length` chars
  if (out.length >= length) {
    return out.slice(0, length)
  }
  return out.padStart(length, "0")
}

/**
 * Get cache directory with fallback logic converted from Go code
 */
export function getCacheDirectory(isAvoidSystemOnWindows = false): string {
  const env = process.env.ELECTRON_BUILDER_CACHE?.trim()
  if (env) {
    return env
  }

  const appName = "electron-builder"

  const platform = os.platform()
  const homeDir = os.homedir()

  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Caches", appName)
  }

  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA?.trim()
    const username = process.env.USERNAME?.trim()?.toLowerCase()
    const isSystemUser = isAvoidSystemOnWindows && (localAppData?.toLowerCase()?.includes("\\windows\\system32\\") || username === "system")
    if (!localAppData || isSystemUser) {
      return path.join(os.tmpdir(), `${appName}-cache`)
    }
    return path.join(localAppData, appName, "Cache")
  }

  // linux
  const xdgCache = process.env.XDG_CACHE_HOME
  if (xdgCache) {
    return path.join(xdgCache, appName)
  }

  return path.join(homeDir, ".cache", appName)
}

/**
 * Progress callback type
 */
export type ProgressCallback = (info: { stage: "download" | "extract"; message: string; percent?: number; current?: number; total?: number }) => void

/**
 * Downloads an artifact from GitHub releases (convenience wrapper)
 */
export async function downloadArtifact(options: { releaseName: string; filenameWithExt: string; checksums: Record<string, string>; githubOrgRepo?: string }): Promise<string> {
  const { releaseName, filenameWithExt, checksums, githubOrgRepo = "electron-userland/electron-builder-binaries" } = options
  const progress = (process.stdout as TtyWriteStream).isTTY ? new MultiProgress() : null

  log.info({ release: releaseName, file: filenameWithExt }, "downloading")
  const progressBar = progress?.createBar(`${" ".repeat(PADDING + 2)}[:bar] :percent | ${filenameWithExt}`, { total: 100 })
  progressBar?.render()

  const file = await _downloadArtifact(`https://github.com/${githubOrgRepo}/releases/download/`, releaseName, filenameWithExt, checksums, info => {
    progressBar?.update(info.percent != null ? Math.floor(info.percent * 100) : 0)
  })

  log.debug({ file: filenameWithExt, path: file }, "downloaded")
  progressBar?.update(100)
  progressBar?.terminate()
  return file
}

/**
 * Downloads, validates, and extracts a binary from a release URL
 */
async function _downloadArtifact(baseUrl: string, releaseName: string, filenameWithExt: string, checksums: Record<string, string>, onProgress?: ProgressCallback): Promise<string> {
  const folderName = `${filenameWithExt.replace(/\.(tar\.gz|tgz)$/, "")}-${hashUrlSafe(baseUrl)}`
  const downloadDir = path.join(getCacheDirectory(), releaseName, folderName)
  const extractionCompleteMarker = path.join(downloadDir, ".complete")

  // Ensure download directory exists before trying to lock
  await fs.mkdir(downloadDir, { recursive: true })

  // Acquire the lock
  let release: (() => Promise<void>) | undefined
  try {
    release = await lockfile.lock(downloadDir, {
      retries: {
        retries: 5,
        minTimeout: 1000,
        maxTimeout: 5000,
      },
      stale: 60000, // Consider lock stale after 60 seconds
    })

    if (await exists(extractionCompleteMarker)) {
      onProgress?.({
        stage: "extract",
        message: "Using cached extraction",
        percent: 100,
      })
      return downloadDir
    }

    // These are just stubs. Overrides are in `mirrorOptions` below.
    const details: ElectronDownloadRequest = {
      version: "0.0.0",
      artifactName: filenameWithExt, // also is the output filename
    }

    const downloadOptions: GotDownloaderOptions = {
      getProgressCallback: progressInfo => {
        onProgress?.({
          stage: "download",
          message: `Downloading ${filenameWithExt}`,
          percent: progressInfo.percent,
        })
        return Promise.resolve()
      },
    }

    const cacheMode = Number(process.env.ELECTRON_BUILDER_CACHE_MODE?.trim())
    if (cacheMode in ElectronDownloadCacheMode) {
      log.debug({ mode: ElectronDownloadCacheMode[cacheMode] }, "using cache mode from ELECTRON_BUILDER_CACHE_MODE")
    }

    const options: ElectronDownloadRequestOptions = {
      cacheRoot: downloadDir,
      cacheMode: cacheMode in ElectronDownloadCacheMode ? cacheMode : ElectronDownloadCacheMode.ReadWrite,
      downloadOptions,
      checksums,
      mirrorOptions: {
        mirror: baseUrl,
        customDir: releaseName,
        customFilename: filenameWithExt,
      },
    }

    const downloadedFile = await get.downloadArtifact({
      ...details,
      ...options,
      isGeneric: true,
    })

    // Extract the tar.gz file with progress tracking
    onProgress?.({
      stage: "extract",
      message: "Extracting archive",
      percent: 0,
    })

    let entriesExtracted = 0
    await tar.extract({
      file: downloadedFile,
      cwd: downloadDir,
      strip: 1, // Strip the top-level directory from the archive
      onentry: entry => {
        entriesExtracted++
        onProgress?.({
          stage: "extract",
          message: `Extracting: ${entry.path}`,
          current: entriesExtracted,
        })
      },
    })

    await fs.writeFile(extractionCompleteMarker, "")

    onProgress?.({
      stage: "extract",
      message: `Extraction complete (${entriesExtracted} files)`,
      percent: 100,
      current: entriesExtracted,
      total: entriesExtracted,
    })
    return downloadDir
  } finally {
    // Release the lock
    if (release) {
      await release()
    }
  }
}

const versionToPromise = new Map<string, Promise<string>>()

export function download(url: string, output: string, checksum?: string | null): Promise<void> {
  const args = ["download", "--url", url, "--output", output]
  if (checksum != null) {
    args.push("--sha512", checksum)
  }
  return executeAppBuilder(args) as Promise<any>
}

export function getBinFromCustomLoc(name: string, version: string, binariesLocUrl: string, checksum: string): Promise<string> {
  const dirName = `${name}-${version}`
  return getBin(dirName, binariesLocUrl, checksum)
}

export function getBinFromUrl(releaseName: string, filenameWithExt: string, checksum: string, githubOrgRepo = "electron-userland/electron-builder-binaries"): Promise<string> {
  let url: string
  if (process.env.ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL) {
    url = process.env.ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL + "/" + filenameWithExt
  } else {
    const baseUrl =
      process.env.NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR ||
      process.env.npm_config_electron_builder_binaries_mirror ||
      process.env.npm_package_config_electron_builder_binaries_mirror ||
      process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
      `https://github.com/${githubOrgRepo}/releases/download/`
    const middleUrl =
      process.env.NPM_CONFIG_ELECTRON_BUILDER_BINARIES_CUSTOM_DIR ||
      process.env.npm_config_electron_builder_binaries_custom_dir ||
      process.env.npm_package_config_electron_builder_binaries_custom_dir ||
      process.env.ELECTRON_BUILDER_BINARIES_CUSTOM_DIR ||
      releaseName
    url = `${baseUrl}${middleUrl}/${filenameWithExt}`
  }

  const cacheKey = `${releaseName}-${path.basename(filenameWithExt, path.extname(filenameWithExt))}`
  return getBin(cacheKey, url, checksum)
}

export function getBin(cacheKey: string, url?: string | null, checksum?: string | null): Promise<string> {
  // Old cache is ignored if cache environment variable changes
  const cacheName = sanitizeFileName(`${process.env.ELECTRON_BUILDER_CACHE ?? ""}${cacheKey}`)
  let promise = versionToPromise.get(cacheName) // if rejected, we will try to download again

  if (promise != null) {
    return promise
  }

  promise = doGetBin(cacheKey, url, checksum)
  versionToPromise.set(cacheName, promise)
  return promise
}

function doGetBin(name: string, url: string | Nullish, checksum: string | Nullish): Promise<string> {
  const args = ["download-artifact", "--name", name]
  if (url != null) {
    args.push("--url", url)
  }
  if (checksum != null) {
    args.push("--sha512", checksum)
  }
  return executeAppBuilder(args)
}
