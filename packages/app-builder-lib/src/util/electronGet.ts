import { downloadArtifact as _downloadArtifact, ElectronDownloadCacheMode, ElectronPlatformArtifactDetails, GotDownloaderOptions, MirrorOptions } from "@electron/get"
import { getUserDefinedCacheDir, PADDING } from "builder-util"
import * as chalk from "chalk"
import { MultiProgress } from "electron-publish/out/multiProgress"

const configToPromise = new Map<string, Promise<string>>()

export type ElectronDownloadOptions = Omit<
  ElectronPlatformArtifactDetails,
  "platform" | "arch" | "version" | "artifactName" | "artifactSuffix" | "customFilename" | "tempDirectory" | "downloader" | "cacheMode" | "cacheRoot" | "downloadOptions"
> & {
  mirrorOptions: Omit<MirrorOptions, "customDir" | "customFilename" | "customVersion">
}

type ElectronGetDownloadConfig = {
  electronDownload?: ElectronDownloadOptions
  artifactName: string
  platformName: string
  arch: string
  version: string
}

export async function downloadArtifact(config: ElectronGetDownloadConfig, progress: MultiProgress | null) {
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

async function doDownloadArtifact(config: ElectronGetDownloadConfig, cacheDir: string | undefined, progress: MultiProgress | null) {
  const { electronDownload, arch, version, platformName, artifactName } = config

  const progressBar = progress?.createBar(`${" ".repeat(PADDING + 2)}[:bar] :percent | ${chalk.green(artifactName)}`, { total: 100 })
  progressBar?.render()

  const downloadOptions: GotDownloaderOptions = {
    getProgressCallback: progress => {
      progressBar?.update(progress.percent)
      return Promise.resolve()
    },
  }
  const artifactConfig: ElectronPlatformArtifactDetails = {
    cacheMode: ElectronDownloadCacheMode.ReadOnly,
    cacheRoot: cacheDir,
    ...(electronDownload ?? {}),
    platform: platformName,
    arch,
    version,
    artifactName,
    downloadOptions,
  }

  const dist = await _downloadArtifact(artifactConfig)
  progressBar?.update(100)
  progressBar?.terminate()

  return dist
}
