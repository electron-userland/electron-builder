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
 * Get cache directory for electron-builder
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
 * Downloads an artifact from GitHub releases (convenience wrapper)
 */
export async function downloadArtifact(options: { releaseName: string; filenameWithExt: string; checksums: Record<string, string>; githubOrgRepo?: string }): Promise<string> {
  const { releaseName, filenameWithExt, checksums, githubOrgRepo = "electron-userland/electron-builder-binaries" } = options

  const file = await _downloadArtifact(`https://github.com/${githubOrgRepo}/releases/download/`, releaseName, filenameWithExt, checksums)

  return file
}

/**
 * Downloads, validates, and extracts a .tar.gz from a release URL
 */
async function _downloadArtifact(baseUrl: string, releaseName: string, filenameWithExt: string, checksums: Record<string, string>): Promise<string> {
  const suffix = hashUrlSafe(`${baseUrl}-${releaseName}-${filenameWithExt}`, 5)
  const folderName = `${filenameWithExt.replace(/\.(tar\.gz|tgz)$/, "")}-${suffix}`
  const extractDir = path.join(getCacheDirectory(), releaseName, folderName)
  const extractionCompleteMarker = `${extractDir}.complete`

  // Ensure download directory exists before trying to lock
  await fs.mkdir(extractDir, { recursive: true })

  // Acquire the lock
  let release: (() => Promise<void>) | undefined
  try {
    release = await lockfile.lock(extractDir, {
      retries: {
        retries: 5,
        minTimeout: 1000,
        maxTimeout: 5000,
      },
      stale: 60000,
    })

    let cacheMode: ElectronDownloadCacheMode = ElectronDownloadCacheMode.ReadWrite
    const cacheOverride = process.env.ELECTRON_BUILDER_CACHE_MODE?.trim()
    if (cacheOverride && Number(cacheOverride) in ElectronDownloadCacheMode) {
      cacheMode = Number(cacheOverride)
      log.debug({ mode: cacheMode }, "cache mode overridden via env var ELECTRON_BUILDER_CACHE_MODE")
    }

    if (await exists(extractionCompleteMarker)) {
      log.debug({ file: filenameWithExt, path: extractDir }, "using cached artifact - skipping download/extract")
      return extractDir
    }

    // These are just stubs. Actual url construction/file naming are in `mirrorOptions` below.
    const details: ElectronDownloadRequest = {
      // Needs to be higher than 1.3.2 to avoid @electron/get validation shortcut
      // https://github.com/electron/get/blob/05c466d4fc60fa0c83064df28dce245eb83d63c9/src/index.ts#L60
      version: "9.9.9",
      artifactName: filenameWithExt, // also is the output filename
    }

    const progress = process.stdout.isTTY ? new MultiProgress() : null
    const progressBar = progress?.createBar(`${" ".repeat(PADDING + 2)}[:bar] :percent | ${filenameWithExt}`, { total: 100 })

    const downloadOptions: GotDownloaderOptions = {
      getProgressCallback: info => {
        progressBar?.update(info.percent != null ? Math.floor(info.percent * 100) : 0)
        return Promise.resolve()
      },
    }
    const options: ElectronDownloadRequestOptions = {
      cacheRoot: path.resolve(getCacheDirectory(), "downloads"),
      cacheMode,
      downloadOptions,
      checksums,
      mirrorOptions: {
        // `${opts.mirror}${opts.customDir}/${opts.customFilename}`
        mirror: baseUrl,
        customDir: releaseName,
        customFilename: filenameWithExt,
      },
    }

    log.info({ release: releaseName, file: filenameWithExt }, "downloading")
    progressBar?.render()
    const downloadedFile = await get.downloadArtifact({
      ...details,
      ...options,
      isGeneric: true,
    })

    await tar.extract({
      file: downloadedFile,
      cwd: extractDir,
      strip: 1, // Strip the top-level directory from the archive
    })

    // Write the extraction complete marker file to indicate successful extraction and prevent future re-extraction
    await fs.writeFile(extractionCompleteMarker, "")

    log.debug({ file: filenameWithExt, path: extractDir }, "downloaded")
    progressBar?.update(100)
    progressBar?.terminate()

    return extractDir
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
