import { path7za } from "7zip-bin"
import BluebirdPromise from "bluebird-lst"
import { CancellationToken, DownloadOptions } from "builder-util-runtime"
import _debug from "debug"
import { emptyDir, rename, unlink } from "fs-extra-p"
import * as path from "path"
import { getTempName } from "temp-file"
import { statOrNull } from "./fs"
import { log, warn } from "./log"
import { httpExecutor } from "./nodeHttpExecutor"
import { debug7zArgs, getCacheDirectory, spawn } from "./util"

const debug = _debug("electron-builder:binDownload")

const versionToPromise = new Map<string, BluebirdPromise<string>>()

export function getBinFromBintray(name: string, version: string, sha2: string): Promise<string> {
  const dirName = `${name}-${version}`
  return getBin(name, dirName, `https://dl.bintray.com/electron-userland/bin/${dirName}.7z`, sha2)
}

export function getBinFromGithub(name: string, version: string, checksum: string): Promise<string> {
  const dirName = `${name}-${version}`
  return getBin(name, dirName, `https://github.com/electron-userland/electron-builder-binaries/releases/download/${dirName}/${dirName}.7z`, checksum)
}

export function getBin(name: string, dirName: string, url: string, checksum: string): Promise<string> {
  let promise = versionToPromise.get(dirName)
  // if rejected, we will try to download again
  if (promise != null && !promise.isRejected()) {
    return promise
  }

  promise = doGetBin(name, dirName, url, checksum) as BluebirdPromise<string>
  versionToPromise.set(dirName, promise)
  return promise
}

// we cache in the global location - in the home dir, not in the node_modules/.cache (https://www.npmjs.com/package/find-cache-dir) because
// * don't need to find node_modules
// * don't pollute user project dir (important in case of 1-package.json project structure)
// * simplify/speed-up tests (don't download fpm for each test project)
async function doGetBin(name: string, dirName: string, url: string, checksum: string): Promise<string> {
  const cachePath = path.join(getCacheDirectory(), name)
  const dirPath = path.join(cachePath, dirName)

  const dirStat = await statOrNull(dirPath)
  //noinspection ES6MissingAwait
  if (dirStat != null && dirStat.isDirectory()) {
    debug(`Found existing ${name} ${dirPath}`)
    return dirPath
  }

  log(`Downloading ${dirName}, please wait`)

  // 7z cannot be extracted from the input stream, temp file is required
  const tempUnpackDir = path.join(cachePath, getTempName())
  const archiveName = `${tempUnpackDir}.7z`
  debug(`Download ${name} from ${url} to ${archiveName}`)
  // 7z doesn't create out dir, so, we don't create dir in parallel to download - dir creation will create parent dirs for archive file also
  await emptyDir(tempUnpackDir)
  const options: DownloadOptions = {
    skipDirCreation: true,
    cancellationToken: new CancellationToken(),
  }

  if (checksum.length === 64 && !checksum.includes("+") && !checksum.includes("Z") && !checksum.includes("=")) {
    (options as any).sha2 = checksum
  }
  else {
    (options as any).sha512 = checksum
  }

  for (let attemptNumber = 1; attemptNumber < 4; attemptNumber++) {
    try {
      await httpExecutor.download(url, archiveName, options)
    }
    catch (e) {
      if (attemptNumber >= 3) {
        throw e
      }

      warn(`Cannot download ${name}, attempt #${attemptNumber}: ${e}`)
      await new BluebirdPromise((resolve, reject) => {
        setTimeout(() => httpExecutor.download(url, archiveName, options).then(resolve).catch(reject), 1000 * attemptNumber)
      })
    }
  }

  await spawn(path7za, debug7zArgs("x").concat(archiveName, `-o${tempUnpackDir}`), {
    cwd: cachePath,
  })

  await BluebirdPromise.all([
    rename(tempUnpackDir, dirPath)
      .catch(e => {
        console.warn(`Cannot move downloaded ${name} into final location (another process downloaded faster?): ${e}`)
      }),
    unlink(archiveName),
  ])

  debug(`${name}} downloaded to ${dirPath}`)
  return dirPath
}