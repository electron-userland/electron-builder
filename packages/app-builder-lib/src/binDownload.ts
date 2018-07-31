import { executeAppBuilder } from "builder-util"

const versionToPromise = new Map<string, Promise<string>>()

export function download(url: string, output: string, checksum?: string | null): Promise<void> {
  const args = ["download", "--url", url, "--output", output]
  if (checksum != null) {
    args.push("--sha512", checksum)
  }
  return executeAppBuilder(args) as Promise<any>
}

export function getBinFromGithub(name: string, version: string, checksum: string): Promise<string> {
  const dirName = `${name}-${version}`
  return getBin(dirName, `https://github.com/electron-userland/electron-builder-binaries/releases/download/${dirName}/${dirName}.7z`, checksum)
}

export function getBin(name: string, url: string, checksum: string | null): Promise<string> {
  let promise = versionToPromise.get(name)
  // if rejected, we will try to download again
  if (promise != null) {
    return promise
  }

  promise = doGetBin(name, url, checksum)
  versionToPromise.set(name, promise)
  return promise
}

function doGetBin(name: string, url: string, checksum: string | null): Promise<string> {
  const args = ["download-artifact", "--url", url, "--name", name]
  if (checksum != null) {
    args.push("--sha512", checksum)
  }

  return executeAppBuilder(args)
}