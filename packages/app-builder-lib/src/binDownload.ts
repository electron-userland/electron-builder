import * as get from "@electron/get"
import { ElectronDownloadCacheMode } from "@electron/get"
import * as fs from "fs/promises"
import { parseValidEnvVarUrl } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { sanitizeFileName } from "builder-util/out/filename"
import * as path from "path"
import { downloadBuilderToolset, getBinariesMirrorUrl, getCacheDirectory } from "./util/electronGet"

const versionToPromise = new Map<string, Promise<string>>()

export async function download(url: string, output: string, checksum?: string | null): Promise<void> {
  const filenameWithExt = path.basename(new URL(url).pathname)
  const downloadedFile = await get.downloadArtifact({
    version: "9.9.9",
    artifactName: filenameWithExt,
    cacheRoot: path.resolve(getCacheDirectory(), "downloads"),
    cacheMode: ElectronDownloadCacheMode.ReadWrite,
    ...(checksum != null ? { checksums: { [filenameWithExt]: checksum } } : { unsafelyDisableChecksums: true }),
    mirrorOptions: { resolveAssetURL: async () => Promise.resolve(url) },
    isGeneric: true,
  })
  await fs.copyFile(downloadedFile, output)
}

export function getBinFromCustomLoc(name: string, version: string, binariesLocUrl: string, checksum: string): Promise<string> {
  const dirName = `${name}-${version}`
  return getBin(dirName, binariesLocUrl, checksum)
}

export function getBinFromUrl(releaseName: string, filenameWithExt: string, checksum: string, githubOrgRepo = "electron-userland/electron-builder-binaries"): Promise<string> {
  let url: string
  const overrideUrl = parseValidEnvVarUrl("ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL")
  if (overrideUrl != null) {
    url = overrideUrl + "/" + filenameWithExt
  } else {
    const baseUrl = getBinariesMirrorUrl(githubOrgRepo)
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

export function getBin(cacheKey: string, url?: string | Nullish, checksum?: string | Nullish): Promise<string> {
  const cacheName = sanitizeFileName(`${process.env.ELECTRON_BUILDER_CACHE ?? ""}${cacheKey}`)
  let promise = versionToPromise.get(cacheName)
  if (promise != null) {
    return promise
  }

  if (url == null) {
    throw new Error(
      `getBin("${cacheKey}"): a download URL is required. ` +
        `The no-URL legacy path (e.g. winCodeSign "0.0.0") is no longer used — ` +
        `it now downloads from winCodeSign-2.6.0 automatically.`
    )
  }

  const filenameWithExt = path.basename(url)
  const overrideUrl = url.substring(0, url.lastIndexOf("/"))
  const releaseName = path.basename(overrideUrl)

  promise = downloadBuilderToolset({
    releaseName,
    filenameWithExt,
    checksums: checksum != null ? { [filenameWithExt]: checksum } : undefined,
    overrideUrl,
  })
  versionToPromise.set(cacheName, promise)
  return promise
}
