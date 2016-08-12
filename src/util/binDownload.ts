import { statOrNull, spawn, debug, debug7zArgs, getTempName } from "./util"
import { rename, remove, unlink, emptyDir } from "fs-extra-p"
import { download } from "./httpRequest"
import { path7za } from "7zip-bin"
import * as path from "path"
import { homedir } from "os"
import { Promise as BluebirdPromise } from "bluebird"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

const versionToPromise = new Map<string, BluebirdPromise<string>>()

// can be called in parallel, all calls for the same version will get the same promise - will be downloaded only once
export function downloadFpm(version: string, osAndArch: string): Promise<string> {
  return getBin("fpm", `fpm-${version}-${osAndArch}`, `https://github.com/develar/fpm-self-contained/releases/download/v${version}/${`fpm-${version}-${osAndArch}`}.7z`)
    .then(it => path.join(it, "fpm"))
}

export function getBinFromBintray(name: string, version: string, sha2?: string): Promise<string> {
  const dirName = `${name}-${version}`
  return getBin(name, dirName, `https://dl.bintray.com/electron-userland/bin/${dirName}.7z`, sha2)
}

export function getBin(name: string, dirName: string, url: string, sha2?: string): Promise<string> {
  let promise = versionToPromise.get(dirName)
  // if rejected, we will try to download again
  if (promise != null && !promise.isRejected()) {
    return promise
  }

  promise = <BluebirdPromise<string>>doGetBin(name, dirName, url, sha2)
  versionToPromise.set(dirName, promise)
  return promise
}

// we cache in the global location - in the home dir, not in the node_modules/.cache (https://www.npmjs.com/package/find-cache-dir) because
// * don't need to find node_modules
// * don't pollute user project dir (important in case of 1-package.json project structure)
// * simplify/speed-up tests (don't download fpm for each test project)
async function doGetBin(name: string, dirName: string, url: string, sha2?: string): Promise<string> {
  const cachePath = path.join(homedir(), ".cache", name)
  const dirPath = path.join(cachePath, dirName)

  const dirStat = await statOrNull(dirPath)
  if (dirStat != null && dirStat.isDirectory()) {
    debug(`Found existing ${name} ${dirPath}`)
    return dirPath
  }

  // 7z cannot be extracted from the input stream, temp file is required
  const tempUnpackDir = path.join(cachePath, getTempName())
  const archiveName = `${tempUnpackDir}.7z`
  debug(`Download ${name} from ${url} to ${archiveName}`)
  // 7z doesn't create out dir, so, we don't create dir in parallel to download - dir creation will create parent dirs for archive file also
  await emptyDir(tempUnpackDir)
  await download(url, archiveName, {
    skipDirCreation: true,
    sha2: sha2,
  })

  await spawn(path7za, debug7zArgs("x").concat(archiveName, `-o${tempUnpackDir}`), {
    cwd: cachePath,
  })

  const isOldMethod = sha2 == null

  await BluebirdPromise.all([
    rename(isOldMethod ? path.join(tempUnpackDir, dirName) : tempUnpackDir, dirPath)
      .catch(e => {
        console.warn(`Cannot move downloaded ${name} into final location (another process downloaded faster?): ${e}`)
      }),
    unlink(archiveName),
  ])

  if (isOldMethod) {
    await remove(tempUnpackDir)
  }

  debug(`${name}} downloaded to ${dirPath}`)
  return dirPath
}