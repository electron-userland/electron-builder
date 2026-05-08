import * as get from "@electron/get"
import {
  ElectronDownloadCacheMode,
  ElectronDownloadRequest,
  ElectronDownloadRequestOptions,
  ElectronPlatformArtifactDetails,
  GotDownloaderOptions,
  MirrorOptions,
} from "@electron/get"
import { exists, log, PADDING, parseValidEnvVarUrl } from "builder-util"
import { MultiProgress } from "electron-publish/out/multiProgress"
import * as extractZip from "extract-zip"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import * as lockfile from "proper-lockfile"
import * as tar from "tar"
import { ElectronPlatformName } from "../electron/ElectronFramework"

export type ElectronGetOptions = Omit<
  ElectronPlatformArtifactDetails,
  | "platform"
  | "arch"
  | "version"
  | "artifactName"
  | "artifactSuffix"
  | "customFilename"
  | "tempDirectory"
  | "downloader"
  | "cacheMode"
  | "cacheRoot"
  | "downloadOptions"
  | "mirrorOptions" // to be added below
> & {
  mirrorOptions?: Omit<MirrorOptions, "customDir" | "customFilename" | "customVersion">
}

export type ArtifactDownloadOptions = {
  electronDownload?: ElectronGetOptions | ElectronDownloadOptions | null
  artifactName: string
  platformName: string
  arch: string
  version: string
  cacheDir?: string
}

export interface ElectronDownloadOptions {
  // https://github.com/electron-userland/electron-builder/issues/3077
  // must be optional
  version?: string

  /**
   * The [cache location](https://github.com/electron-userland/electron-download#cache-location).
   */
  cache?: string | null

  /**
   * The mirror.
   */
  mirror?: string | null

  /** @private */
  customDir?: string | null
  /** @private */
  customFilename?: string | null

  strictSSL?: boolean
  isVerifyChecksum?: boolean

  platform?: ElectronPlatformName
  arch?: string
}

function hashUrlSafe(input: string, length = 6): string {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i)
  }
  hash >>>= 0
  const out = hash.toString(36)
  return out.length >= length ? out.slice(0, length) : out.padStart(length, "0")
}

export function getCacheDirectory(isAvoidSystemOnWindows = false): string {
  const env = process.env.ELECTRON_BUILDER_CACHE?.trim()
  if (env && path.parse(env).root) {
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

  const xdgCache = process.env.XDG_CACHE_HOME
  return xdgCache && path.parse(xdgCache).root ? path.join(xdgCache, appName) : path.join(homeDir, ".cache", appName)
}

function resolveCacheMode(): ElectronDownloadCacheMode {
  const varName = "ELECTRON_DOWNLOAD_CACHE_MODE"
  const cacheOverride = process.env[varName]?.trim()
  if (cacheOverride && Number(cacheOverride) in ElectronDownloadCacheMode) {
    const mode = Number(cacheOverride) as ElectronDownloadCacheMode
    log.debug({ mode }, `cache mode overridden via env var ${varName}`)
    return mode
  }
  return ElectronDownloadCacheMode.ReadWrite
}

async function extractArchive(file: string, dir: string) {
  if (file.endsWith(".tar.gz") || file.endsWith(".tgz")) {
    await fs.mkdir(dir, { recursive: true })
    await tar.extract({ file, cwd: dir, strip: 1 })
  } else if (file.endsWith(".zip")) {
    await extractZip(file, { dir })
  } else {
    throw new Error(`Unsupported archive format: ${path.basename(file)}`)
  }
}

/**
 * Core download + extract engine. Handles lockfile, cache-hit short-circuit,
 * progress bar, extraction (.zip or .tar.gz), and completion marker.
 * Both public download functions delegate here after building their respective configs.
 */
async function downloadAndExtract(config: Parameters<typeof get.downloadArtifact>[0], extractDir: string, label: string, progress: MultiProgress | null): Promise<string> {
  const completeMarker = `${extractDir}.complete`
  const isCached = async () => exists(completeMarker)

  await fs.mkdir(extractDir, { recursive: true })

  if (await isCached()) {
    log.debug({ file: label, path: extractDir }, "using cached artifact - skipping download/extract")
    return extractDir
  }

  const release = await lockfile.lock(extractDir, {
    retries: { retries: 5, minTimeout: 1000, maxTimeout: 5000 },
    stale: 60000,
  })
  try {
    // Re-check after acquiring lock: another worker may have completed while we waited.
    if (await isCached()) {
      log.debug({ file: label, path: extractDir }, "using cached artifact - skipping download/extract")
      return extractDir
    }

    const progressBar = progress?.createBar(`${" ".repeat(PADDING + 2)}[:bar] :percent | ${label}`, { total: 100 })
    progressBar?.render()

    const downloadOptions: GotDownloaderOptions = {
      ...config.downloadOptions,
      getProgressCallback: info => {
        progressBar?.update(info.percent != null ? Math.floor(info.percent * 100) : 0)
        return Promise.resolve()
      },
    }

    log.info({ label }, "downloading")
    const downloadedFile = await get.downloadArtifact({ ...config, downloadOptions })

    await extractArchive(downloadedFile, extractDir)
    await fs.writeFile(completeMarker, "")

    progressBar?.update(100)
    progressBar?.terminate()

    return extractDir
  } finally {
    await release().catch(err => log.warn({ err }, "failed to release lockfile"))
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Downloads a generic artifact (.tar.gz or .zip) from a GitHub release.
 * Used for electron-builder-binaries tools (appimage, etc.).
 */
export async function downloadBuilderToolset(options: {
  releaseName: string
  filenameWithExt: string
  checksums: Record<string, string>
  githubOrgRepo?: string
}): Promise<string> {
  const { releaseName, filenameWithExt, checksums, githubOrgRepo = "electron-userland/electron-builder-binaries" } = options

  const baseUrl = getBinariesMirrorUrl(githubOrgRepo)
  const suffix = hashUrlSafe(`${baseUrl}-${releaseName}-${filenameWithExt}`, 5)
  const folderName = `${filenameWithExt.replace(/\.(tar\.gz|tgz|zip)$/, "")}-${suffix}`
  const extractDir = path.join(getCacheDirectory(), releaseName, folderName)

  const config: ElectronDownloadRequest & ElectronDownloadRequestOptions & { isGeneric: true } = {
    version: "9.9.9", // must be >1.3.2 to bypass @electron/get validation shortcut
    artifactName: filenameWithExt,
    cacheRoot: path.resolve(getCacheDirectory(), "downloads"),
    cacheMode: resolveCacheMode(),
    checksums,
    mirrorOptions: {
      // `${mirror}${customDir}/${customFilename}`
      mirror: baseUrl,
      customDir: releaseName,
      customFilename: filenameWithExt,
    },
    isGeneric: true,
  }

  const progress = process.stdout.isTTY ? new MultiProgress() : null
  return downloadAndExtract(config, extractDir, filenameWithExt, progress)
}

// Keys present in ElectronGetOptions but absent from ElectronDownloadOptions.
// Used to discriminate between the two config shapes at runtime.
const ELECTRON_GET_EXCLUSIVE_KEYS: readonly string[] = ["mirrorOptions", "force", "unsafelyDisableChecksums"]

function isElectronGetOptions(dl: ElectronGetOptions | ElectronDownloadOptions): dl is ElectronGetOptions {
  return ELECTRON_GET_EXCLUSIVE_KEYS.some(k => Object.hasOwnProperty.call(dl, k))
}

/**
 * Downloads and extracts an electron platform artifact (e.g. ffmpeg) using @electron/get.
 * Deduplicates concurrent calls for the same artifact within the same process.
 */
export async function downloadElectronArtifact(options: ArtifactDownloadOptions, progress: MultiProgress | null): Promise<string> {
  const { electronDownload, arch, version, platformName: platform, artifactName, cacheDir: cacheRoot } = options

  let artifactConfig: ElectronPlatformArtifactDetails = { cacheRoot, platform, arch, version, artifactName }

  if (electronDownload != null) {
    if (isElectronGetOptions(electronDownload)) {
      const { mirrorOptions, ...rest } = electronDownload
      artifactConfig = { ...artifactConfig, ...rest, cacheRoot, mirrorOptions }
    } else {
      const { mirror, customDir, cache, customFilename, isVerifyChecksum, strictSSL, platform: overridePlatform, arch: overrideArch } = electronDownload
      artifactConfig = {
        ...artifactConfig,
        unsafelyDisableChecksums: isVerifyChecksum === false,
        cacheRoot: cache ?? cacheRoot,
        mirrorOptions: {
          mirror: mirror || undefined,
          customDir: customDir || undefined,
          customFilename: customFilename || undefined,
        },
        ...(strictSSL === false ? { downloadOptions: { https: { rejectUnauthorized: false } } } : {}),
      }
      if (overridePlatform != null) {
        artifactConfig.platform = overridePlatform
      }
      if (overrideArch != null) {
        artifactConfig.arch = overrideArch
      }
    }
  }

  artifactConfig.cacheMode = resolveCacheMode()

  const suffix = hashUrlSafe(JSON.stringify(artifactConfig), 5)
  const folderName = `${artifactName}-v${version}-${platform}-${arch}-${suffix}`
  const extractDir = path.join(getCacheDirectory(), `${artifactName}-v${version}`, folderName)

  return downloadAndExtract(artifactConfig, extractDir, artifactName, progress)
}

/**
 * Get the binaries mirror URL from environment variables.
 * Supports various npm config formats and falls back to GitHub.
 */
export function getBinariesMirrorUrl(githubOrgRepo: string): string {
  for (const envVar of [
    "NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR",
    "npm_config_electron_builder_binaries_mirror",
    "npm_package_config_electron_builder_binaries_mirror",
    "ELECTRON_BUILDER_BINARIES_MIRROR",
  ]) {
    const url = parseValidEnvVarUrl(envVar)
    if (url) {
      return url.endsWith("/") ? url : `${url}/`
    }
  }
  return `https://github.com/${githubOrgRepo}/releases/download/`
}
