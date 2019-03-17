import { executeAppBuilder } from "builder-util"

const versionToPromise = new Map<string, Promise<string>>()

export function download(url: string, output: string, checksum?: string | null): Promise<void> {
  const args = ["download", "--url", url, "--output", output]
  if (checksum != null) {
    args.push("--sha512", checksum)
  }
  return executeAppBuilder(args) as Promise<any>
}

export function getBinFromUrl(name: string, version: string, checksum: string): Promise<string> {
  const dirName = `${name}-${version}`
  let url: string
  if (process.env.ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL) {
    url = process.env.ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL + "/" + dirName + ".7z"
  }
  else {

    const baseUrl = process.env.NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR ||
      process.env.npm_config_electron_builder_binaries_mirror ||
      process.env.npm_package_config_electron_builder_binaries_mirror ||
      process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
      "https://github.com/electron-userland/electron-builder-binaries/releases/download/"
    const middleUrl = process.env.NPM_CONFIG_ELECTRON_BUILDER_BINARIES_CUSTOM_DIR ||
      process.env.npm_config_electron_builder_binaries_custom_dir ||
      process.env.npm_package_config_electron_builder_binaries_custom_dir ||
      process.env.ELECTRON_BUILDER_BINARIES_CUSTOM_DIR ||
      dirName
    const urlSuffix = dirName + ".7z"
    url = `${baseUrl}${middleUrl}/${urlSuffix}`
  }

  return getBin(dirName, url, checksum)
}

export function getBin(name: string, url?: string | null, checksum?: string | null): Promise<string> {
  let promise = versionToPromise.get(name)
  // if rejected, we will try to download again
  if (promise != null) {
    return promise
  }

  promise = doGetBin(name, url, checksum)
  versionToPromise.set(name, promise)
  return promise
}

function doGetBin(name: string, url: string | undefined | null, checksum: string | null | undefined): Promise<string> {
  const args = ["download-artifact", "--name", name]
  if (url != null) {
    args.push("--url", url)
  }
  if (checksum != null) {
    args.push("--sha512", checksum)
  }
  return executeAppBuilder(args)
}