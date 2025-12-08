import { executeAppBuilder } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { sanitizeFileName } from "builder-util/out/filename"
import * as path from "path"

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
