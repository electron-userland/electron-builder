import * as get from "@electron/get"
import {
  ElectronDownloadCacheMode,
  ElectronDownloadRequest,
  ElectronDownloadRequestOptions,
  ElectronPlatformArtifactDetails,
  GotDownloaderOptions,
  MirrorOptions,
} from "@electron/get"
import { buildGotProxyAgent, exec, exists, log, PADDING, parseValidEnvVarUrl, sanitizeDirPath, to7zaOutputSwitch } from "builder-util"
import { getPath7za } from "../toolsets/7zip.js"
import { MultiProgress } from "electron-publish"
import { createReadStream, createWriteStream } from "fs"
import * as fs from "fs/promises"
import * as crypto from "crypto"
import * as os from "os"
import * as path from "path"
import * as lockfile from "proper-lockfile"
import { pipeline } from "stream/promises"
import * as tar from "tar"
import * as unzipper from "unzipper"
import { HttpError, retry, sleep } from "builder-util-runtime"
import { ElectronPlatformName } from "../electron/ElectronFramework.js"
import { CacheState, cleanupCacheDirectory, computeCacheMetadata, readCacheStateFile, validateCacheDirectory, writeCacheState } from "./cacheState.js"
import type { ProgressBar } from "electron-publish"

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
  | "isGeneric"
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

  /** @private */
  strictSSL?: boolean
  /** @private */
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

export function getCacheDirectory(options: { isAvoidSystemOnWindows?: boolean; allowEnvVarOverride: boolean }): string {
  const { isAvoidSystemOnWindows = true, allowEnvVarOverride } = options
  const env = process.env.ELECTRON_BUILDER_CACHE?.trim()
  if (allowEnvVarOverride && env && path.parse(env).root) {
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
    // https://github.com/electron-userland/electron-builder/issues/1164
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
    // 100 retries (not 15) so concurrent callers wait out a slow first extraction instead of failing
    // with ELOCKED; the update heartbeat keeps an in-progress holder's lock fresh against `stale`.
    retries: { retries: 100, minTimeout: 1000, maxTimeout: 5000 },
    stale: 120000, // Increased from 60s to allow long-running extractions
  })

  try {
    // rm + mkdir happen AFTER acquiring the lock so no concurrent caller can clear our tmpDir mid-extraction
    await fs.rm(tmpDir, { recursive: true, force: true })
    await fs.mkdir(tmpDir, { recursive: true })

    // Guard against the transient window in @electron/get's non-atomic putFileInCache (remove → move).
    // A concurrent worker may have deleted and not yet replaced the source archive; wait briefly for it.
    for (let i = 0; !(await exists(file)); i++) {
      if (i >= 4) {
        throw Object.assign(new Error(`Source archive not found after retries: ${file}`), { code: "ENOENT", path: file })
      }
      log.warn({ file, attempt: i + 1 }, "source archive transiently missing, retrying")
      await sleep(300 * (i + 1))
    }

    if (file.endsWith(".tar.gz") || file.endsWith(".tgz")) {
      await tar.extract({ file, cwd: tmpDir, strip: 1 })
    } else if (file.endsWith(".tar.xz") || file.endsWith(".txz")) {
      // node-tar cannot decompress xz, so use 7za to turn the .tar.xz into a .tar, then extract that tar.
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
        // Check if extraction actually failed or just had benign warnings
        const files = await fs.readdir(tmpDir)
        if (files.length === 0) {
          log.warn({ file, tmpDir, error: e.message }, "7z extraction produced no output")
          throw new Error(`7z extraction failed for ${file}: ${e.message}`)
        }
        // If files were extracted despite the error, log and continue
        log.warn({ error: e.message, filesExtracted: files.length }, "7z reported error but extracted files")
      }
    } else {
      throw new Error(`Unsupported archive format: ${path.basename(file)}`)
    }

    // Verify extraction produced files
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

async function downloadArtifactToFile(config: Parameters<typeof get.downloadArtifact>[0], label: string): Promise<string> {
  // Serialize concurrent downloads of the same artifact across vitest workers to prevent @electron/get's
  // non-atomic putFileInCache (remove + move) from racing with a concurrent reader.
  const artifactLockKey = crypto
    .createHash("sha256")
    .update(JSON.stringify({ v: config.version, p: (config as any).platform, a: (config as any).arch, n: (config as any).artifactName }))
    .digest("hex")
    .slice(0, 20)
  const artifactLockPath = path.join(os.tmpdir(), `eb-dl-${artifactLockKey}.lock`)
  // This lock is taken even for cache hits (the cache-hit check lives inside @electron/get), so under
  // heavy concurrency many builds serialize here. 30 retries (~137s of backoff) is too few — waiters
  // were exhausting it and failing with ELOCKED while the holder fetched a large artifact. 100 retries
  // matches the other toolset locks; stale (10min) + proper-lockfile's update heartbeat keep a live
  // downloader's lock fresh so the longer wait never falsely steals an in-progress download.
  const releaseArtifactLock = await lockfile.lock(artifactLockPath, {
    retries: { retries: 100, minTimeout: 500, maxTimeout: 5000 },
    stale: 600_000,
    realpath: false,
  })
  let lastLoggedMilestone = -1
  const state: { bar: ProgressBar | undefined } = { bar: undefined }

  const downloadOptions: GotDownloaderOptions = {
    timeout: { request: 10 * 60 * 1000 }, // prevent indefinite hang on stalled connections
    ...config.downloadOptions,
    agent: config.downloadOptions?.agent ?? buildGotProxyAgent(),
    getProgressCallback: info => {
      // @electron/get passes downloadOptions (including this callback) to its internal
      // SHASUMS256.txt validation download. That file is tiny (<1 MB) and fires at 100%
      // immediately, producing a spurious bar even when the artifact itself is cached.
      // Skip progress display for any download whose total size is known and small.
      if (info.total && info.total < 1_000_000) {
        return Promise.resolve()
      }
      if (!state.bar && process.stdout.isTTY) {
        log.info({ label }, "downloading")
        state.bar = new MultiProgress().createBar(`${" ".repeat(PADDING + 2)}[:bar] :percent | ${label}`, { total: 100 })
      }
      const pct = info.percent != null ? Math.floor(info.percent * 100) : 0
      if (state.bar) {
        state.bar.update(pct)
      } else {
        // log every 25% milestone for non-TTY environments (e.g. CI logs) to provide some visibility into download progress without overwhelming logs with too many updates
        const percentCompleted = info.transferred && info.total ? Math.floor((info.transferred / info.total) * 100) : Math.floor(pct / 25) * 25
        if (percentCompleted > lastLoggedMilestone && percentCompleted > 0) {
          lastLoggedMilestone = percentCompleted
          log.info({ label, progress: `${percentCompleted}%` }, percentCompleted !== 100 ? "downloading" : "downloaded")
        }
      }
      return Promise.resolve()
    },
  }

  const configWithProgress = { ...config, downloadOptions }
  try {
    let filePath: string
    try {
      filePath = await retry(() => get.downloadArtifact(configWithProgress), {
        retries: 3,
        interval: 2000,
        backoff: 2000,
        shouldRetry: (e: any) =>
          e instanceof HttpError ? e.isServerError() : typeof e?.code === "string" && ["ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EPIPE", "ENOENT"].includes(e.code),
      })
    } catch (err) {
      if (typeof (err as any)?.message === "string" && (err as any).message.includes("dest already exists")) {
        filePath = await get.downloadArtifact(configWithProgress)
      } else {
        throw err
      }
    }
    if (!(await exists(filePath))) {
      log.warn({ filePath, label }, "cached artifact missing from disk; retrying with cache write")
      filePath = await get.downloadArtifact({ ...configWithProgress, cacheMode: ElectronDownloadCacheMode.WriteOnly })
    }
    if (!state.bar && lastLoggedMilestone === -1) {
      log.info({ label }, "using cached artifact")
    }
    return filePath
  } finally {
    state.bar?.update(100)
    state.bar?.terminate()
    await releaseArtifactLock().catch(err => log.warn({ err }, "failed to release artifact download lock"))
  }
}

/**
 * Core download + extract engine. Handles lockfile, cache-hit short-circuit,
 * progress bar, extraction (.zip or .tar.gz), and completion marker.
 * Both public download functions delegate here after building their respective configs.
 */
async function downloadAndExtract(config: Parameters<typeof get.downloadArtifact>[0], extractDir: string, label: string): Promise<string> {
  await fs.mkdir(extractDir, { recursive: true })

  // Pre-lock fast path: only short-circuit for a definitively complete and valid cache.
  // Do NOT clean up here — concurrent processes could race to delete under each other.
  const stateData = await readCacheStateFile(extractDir)
  if (stateData?.state === CacheState.complete) {
    const isValid = await validateCacheDirectory(extractDir, stateData.fileCount)
    if (isValid) {
      log.debug({ file: label, path: extractDir }, "using cached artifact - cache valid")
      return extractDir
    }
  }

  // Be patient: when many targets/builds contend on the same toolset cache concurrently, all but the
  // first wait here while the winner downloads+extracts (a large bundle can take >1min). 15 retries
  // (~67s) is too few and waiters fail with ELOCKED before the winner finishes; 100 matches the
  // patience of withToolsetLock. proper-lockfile's update heartbeat keeps a live holder's lock fresh,
  // so increasing waiter retries never falsely steals an in-progress extraction.
  const release = await lockfile.lock(extractDir, {
    retries: { retries: 100, minTimeout: 1000, maxTimeout: 5000 },
    stale: 120000,
  })
  let downloadedFile: string | null = null
  try {
    // Re-check after acquiring lock: another worker may have completed while we waited.
    const stateDataAfterLock = await readCacheStateFile(extractDir)
    if (stateDataAfterLock?.state === CacheState.complete) {
      const isValid = await validateCacheDirectory(extractDir, stateDataAfterLock.fileCount)
      if (isValid) {
        log.debug({ file: label, path: extractDir }, "using cached artifact - skipping download/extract")
        return extractDir
      }
      log.warn({ extractDir }, "Cache marked complete but files invalid, clearing")
    } else if (stateDataAfterLock?.state === CacheState.corrupted) {
      log.warn({ extractDir }, "Corrupted cache detected, cleaning up and re-extracting")
    }

    // Cleanup inside the lock — skip lock files since we currently hold them
    await cleanupCacheDirectory(extractDir, { skipLockFiles: true })
    await fs.mkdir(extractDir, { recursive: true })

    log.debug({ file: label }, "downloading")
    downloadedFile = await downloadArtifactToFile(config, label)
    if (!downloadedFile) {
      throw new Error(`Failed to download artifact: ${label}`)
    }

    await writeCacheState(extractDir, CacheState.downloaded)

    // Mark extracting so stale-lock detection can recover a crashed mid-extraction process
    await writeCacheState(extractDir, CacheState.extracting)

    // Extract while holding the lock to prevent concurrent interference
    await extractArchive(downloadedFile, extractDir)

    // Compute metadata with a full recursive walk now that tmpDir has been renamed to extractDir
    const { fileCount, extractedSize } = await computeCacheMetadata(extractDir)

    // Write complete state with metadata BEFORE releasing the lock; throwOnError=true so a
    // failed write (disk full, permissions) propagates instead of silently producing a no-op cache
    await writeCacheState(extractDir, CacheState.complete, { fileCount, extractedSize }, true)
  } finally {
    await release().catch(err => log.warn({ err }, "failed to release lockfile"))
  }
  return extractDir
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Copies a remote artifact to a specific output path on disk.
 * Unlike downloadBuilderToolset, this does not extract archives — it copies the raw file.
 * Used for certificate imports where the caller needs the file at a known path.
 */
export async function download(url: string, output: string, checksum?: string | null): Promise<void> {
  const filenameWithExt = path.basename(new URL(url).pathname)
  if (checksum == null) {
    log.warn({ url }, "downloading without an integrity checksum — the download is not verified against a known-good hash")
  }
  const downloadedFile = await downloadArtifactToFile(
    {
      version: "9.9.9",
      artifactName: filenameWithExt,
      cacheRoot: path.resolve(getCacheDirectory({ allowEnvVarOverride: true }), "downloads"),
      cacheMode: resolveCacheMode(),
      ...(checksum != null ? { checksums: { [filenameWithExt]: checksum } } : { unsafelyDisableChecksums: true }),
      mirrorOptions: { resolveAssetURL: async () => Promise.resolve(url) },
      isGeneric: true,
    },
    filenameWithExt
  )
  await fs.copyFile(downloadedFile, output)
}

function validateBinaryCustomDir(envVarName: string, value: string): string {
  if (value.includes("://") || value.includes("..") || value.startsWith("/")) {
    throw new Error(
      `${envVarName} must be a safe relative path component (e.g. "v1.0.0-custom"). ` + `Values containing "://", "..", or a leading "/" are not allowed. Got: "${value}"`
    )
  }
  return value
}

const CUSTOM_DIR_ENV_VARS = [
  "NPM_CONFIG_ELECTRON_BUILDER_BINARIES_CUSTOM_DIR",
  "npm_config_electron_builder_binaries_custom_dir",
  "npm_package_config_electron_builder_binaries_custom_dir",
  "ELECTRON_BUILDER_BINARIES_CUSTOM_DIR",
] as const

/**
 * Resolves the final download URL for a builder binary, honouring:
 *   ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL  – fully replaces the URL directory
 *   ELECTRON_BUILDER_BINARIES_CUSTOM_DIR (and npm_ variants) – replaces releaseName in the path
 *   overrideUrl (caller-supplied)                     – used as-is when no env var is set
 *
 * Exported for unit testing; not part of the public API.
 * @internal
 */
export function resolveBuilderBinaryUrl(releaseName: string, filenameWithExt: string, baseUrl: string, overrideUrl?: string): string {
  const envOverrideUrl = parseValidEnvVarUrl("ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL")
  if (envOverrideUrl != null) {
    return `${envOverrideUrl}/${filenameWithExt}`
  }
  if (overrideUrl != null) {
    return `${overrideUrl}/${filenameWithExt}`
  }
  const customDirEntry = CUSTOM_DIR_ENV_VARS.map(name => ({ name, value: process.env[name] })).find(e => e.value != null)
  if (customDirEntry != null) {
    return `${baseUrl}${validateBinaryCustomDir(customDirEntry.name, customDirEntry.value!)}/${filenameWithExt}`
  }
  return `${baseUrl}${releaseName}/${filenameWithExt}`
}

/**
 * Downloads a generic artifact (.tar.gz or .zip) from a GitHub release.
 * Used for electron-builder-binaries tools (appimage, etc.).
 */
export async function downloadBuilderToolset(options: {
  releaseName: string
  filenameWithExt: string
  checksums?: Record<string, string>
  githubOrgRepo?: string
  overrideUrl?: string
}): Promise<string> {
  const { releaseName, filenameWithExt, checksums, githubOrgRepo = "electron-userland/electron-builder-binaries", overrideUrl } = options

  if (/[/\\]|^\.\./.test(filenameWithExt) || filenameWithExt.includes("..")) {
    throw new Error(`downloadBuilderToolset: unsafe filenameWithExt "${filenameWithExt}" — must be a plain filename with no path separators or traversal sequences`)
  }

  const baseUrl = getBinariesMirrorUrl(githubOrgRepo)
  const fullUrl = resolveBuilderBinaryUrl(releaseName, filenameWithExt, baseUrl, overrideUrl)
  const suffix = hashUrlSafe(fullUrl, 5)
  const folderName = `${filenameWithExt.replace(/\.(tar\.gz|tgz|tar\.xz|txz|zip|7z)$/, "")}-${suffix}`
  const extractDir = path.join(getCacheDirectory({ allowEnvVarOverride: true }), releaseName, folderName)

  // Use resolveAssetURL so @electron/get's ELECTRON_MIRROR env var check cannot override
  // the builder-binaries URL we've already resolved (see getArtifactRemoteURL in @electron/get).
  const mirrorOptions: MirrorOptions = {
    resolveAssetURL: async () => Promise.resolve(fullUrl),
  }

  const config: ElectronDownloadRequest & ElectronDownloadRequestOptions & { isGeneric: true } = {
    version: "9.9.9", // must be >1.3.2 to bypass @electron/get validation shortcut
    artifactName: filenameWithExt,
    cacheRoot: path.resolve(getCacheDirectory({ allowEnvVarOverride: true }), "downloads"),
    cacheMode: resolveCacheMode(),
    ...(checksums != null ? { checksums } : { unsafelyDisableChecksums: true }),
    mirrorOptions,
    isGeneric: true,
  }
  return downloadAndExtract(config, extractDir, filenameWithExt)
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
function buildElectronArtifactConfig(options: ArtifactDownloadOptions): ElectronPlatformArtifactDetails {
  const { electronDownload, arch, version, platformName: platform, artifactName, cacheDir: cacheRoot } = options

  let artifactConfig: ElectronPlatformArtifactDetails = { cacheRoot, platform, arch, version, artifactName }

  if (electronDownload != null) {
    if (isElectronGetOptions(electronDownload)) {
      const { mirrorOptions, ...rest } = electronDownload
      artifactConfig = { ...artifactConfig, ...rest, cacheRoot, mirrorOptions }
    } else {
      const { mirror, customDir, cache, customFilename, isVerifyChecksum, strictSSL, platform: overridePlatform, arch: overrideArch } = electronDownload
      // strictSSL: false disables TLS certificate validation for all
      // electron/tool downloads.  This option exists only for air-gapped or
      // self-signed-cert environments; ensure your build network is fully trusted.
      if (strictSSL === false) {
        log.warn(
          { option: "electronDownload.strictSSL" },
          "strictSSL is false — TLS certificate validation is DISABLED for Electron downloads. Only use this option in a trusted, isolated build environment."
        )
      }
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
  return artifactConfig
}

/**
 * Downloads the electron artifact zip via @electron/get (with caching) and returns the zip file path.
 * Use when you need to extract the zip yourself (e.g. directly to appOutDir to preserve empty dirs and symlinks).
 */
export function downloadElectronArtifactZip(options: ArtifactDownloadOptions): Promise<string> {
  const config = buildElectronArtifactConfig(options)
  return downloadArtifactToFile(config, config.artifactName)
}

export async function downloadElectronArtifact(options: ArtifactDownloadOptions): Promise<string> {
  const { arch, version, platformName: platform, artifactName } = options
  const artifactConfig = buildElectronArtifactConfig(options)

  const suffix = hashUrlSafe(JSON.stringify(artifactConfig), 5)
  const folderName = `${artifactName}-v${version}-${platform}-${arch}-${suffix}`
  const extractDir = path.join(getCacheDirectory({ allowEnvVarOverride: true }), `${artifactName}-v${version}`, folderName)

  return downloadAndExtract(artifactConfig, extractDir, artifactName)
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
