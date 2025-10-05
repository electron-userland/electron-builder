import { downloadArtifact as _downloadArtifact, ElectronDownloadCacheMode, ElectronPlatformArtifactDetails, GotDownloaderOptions, MirrorOptions } from "@electron/get"
import { getUserDefinedCacheDir, PADDING } from "builder-util"
import * as chalk from "chalk"
import { MultiProgress } from "electron-publish/out/multiProgress"
import { ElectronPlatformName } from "../electron/ElectronFramework"

const configToPromise = new Map<string, Promise<string>>()

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
  mirrorOptions: Omit<MirrorOptions, "customDir" | "customFilename" | "customVersion">
}

type ArtifactDownloadOptions = {
  electronDownload?: ElectronGetOptions | ElectronDownloadOptions | null
  artifactName: string
  platformName: string
  arch: string
  version: string
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

export async function downloadArtifact(config: ArtifactDownloadOptions, progress: MultiProgress | null) {
  // Old cache is ignored if cache environment variable changes
  const cacheDir = await getUserDefinedCacheDir()
  const cacheName = JSON.stringify(config)

  let promise = configToPromise.get(cacheName) // if rejected, we will try to download again

  if (promise != null) {
    return promise
  }

  promise = doDownloadArtifact(config, cacheDir, progress)
  configToPromise.set(cacheName, promise)
  return promise
}

async function doDownloadArtifact(config: ArtifactDownloadOptions, cacheDir: string | undefined, progress: MultiProgress | null) {
  const { electronDownload, arch, version, platformName, artifactName } = config

  const progressBar = progress?.createBar(`${" ".repeat(PADDING + 2)}[:bar] :percent | ${chalk.green(artifactName)}`, { total: 100 })
  progressBar?.render()

  const downloadOptions: GotDownloaderOptions = {
    getProgressCallback: progress => {
      progressBar?.update(progress.percent)
      return Promise.resolve()
    },
  }
  let artifactConfig: ElectronPlatformArtifactDetails = {
    cacheRoot: cacheDir,
    platform: platformName,
    arch,
    version,
    artifactName,
    downloadOptions,
  }
  if (electronDownload != null) {
    // determine whether electronDownload is ElectronGetOptions or ElectronDownloadOptions
    if (Object.hasOwnProperty.call(electronDownload, "mirrorOptions")) {
      const options = electronDownload as ElectronGetOptions
      artifactConfig = { ...artifactConfig, ...options }
    } else {
      const { mirror, customDir, cache, customFilename, isVerifyChecksum, platform, arch: ea } = electronDownload as ElectronDownloadOptions
      artifactConfig = {
        ...artifactConfig,
        unsafelyDisableChecksums: isVerifyChecksum === false,
        cacheRoot: cache ?? cacheDir,
        cacheMode: cache != null ? ElectronDownloadCacheMode.ReadOnly : ElectronDownloadCacheMode.ReadWrite,
        mirrorOptions: {
          mirror: mirror || undefined,
          customDir: customDir || undefined,
          customFilename: customFilename || undefined,
        },
      }
      if (platform != null) {
        artifactConfig.platform = platform
      }
      if (ea != null) {
        artifactConfig.arch = ea
      }
    }
  }

  const dist = await _downloadArtifact(artifactConfig)
  progressBar?.update(100)
  progressBar?.terminate()

  return dist
}
