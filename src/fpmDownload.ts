import { statOrNull, spawn, debug, debug7z } from "./util"
import { writeFile, rename, remove, stat, emptyDir } from "fs-extra-p"
import { download } from "./httpRequest"
import { path7za } from "7zip-bin"
import * as path from "path"
import { homedir } from "os"
import { Promise as BluebirdPromise } from "bluebird"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

let tmpDirCounter = 0

function getTempName(prefix?: string | n): string {
  return `${prefix == null ? "" : prefix + "-"}${process.pid}-${tmpDirCounter++}-${Date.now()}`
}

const versionToPromise = new Map<string, BluebirdPromise<string>>()

// can be called in parallel, all calls for the same version will get the same promise - will be downloaded only once
export function downloadFpm(version: string, osAndArch: string): Promise<string> {
  let promise = versionToPromise.get(version)
  // if rejected, we will try to download again
  if (<any>promise != null && !promise!.isRejected()) {
    return promise!
  }

  promise = <BluebirdPromise<string>>doDownloadFpm(version, osAndArch)
  versionToPromise.set(version, promise)
  return promise
}

async function doDownloadFpm(version: string, osAndArch: string): Promise<string> {
  const dirName = `fpm-${version}-${osAndArch}`
  const url = `https://github.com/develar/fpm-self-contained/releases/download/v${version}/${dirName}.7z`

  // we cache in the global location - in the home dir, not in the node_modules/.cache (https://www.npmjs.com/package/find-cache-dir) because
  // * don't need to find node_modules
  // * don't pollute user project dir (important in case of 1-package.json project structure)
  // * simplify/speed-up tests (don't download fpm for each test project)
  const cacheDir = path.join(homedir(), ".cache", "fpm")
  const fpmDir = path.join(cacheDir, dirName)

  const fpmDirStat = await statOrNull(fpmDir)
  if (fpmDirStat != null && fpmDirStat.isDirectory()) {
    debug(`Found existing fpm ${fpmDir}`)
    return path.join(fpmDir, "fpm")
  }

  // 7z cannot be extracted from the input stream, temp file is required
  const tempName = getTempName()
  const archiveName = path.join(cacheDir, `${tempName}.7z`)
  const tempUnpackDir = path.join(cacheDir, tempName)
  debug(`Download fpm from ${url} to ${archiveName}`)
  await BluebirdPromise.all<any>([download(url, archiveName), emptyDir(tempUnpackDir)])

  if (debug.enabled && (!(await stat(archiveName)).isFile())) {
    throw new Error(`${archiveName} was not downloaded correctly`)
  }

  const args = ["x", archiveName, "-o" + tempUnpackDir, "-bd"]
  if (debug7z.enabled) {
    args.push("-bb3")
  }
  else if (!debug.enabled) {
    args.push("-bb0")
  }

  await spawn(path7za, args, {
    cwd: cacheDir,
    stdio: ["ignore", debug.enabled ? "inherit" : "ignore", "inherit"],
  })

  await BluebirdPromise.all<any>([
    rename(path.join(tempUnpackDir, dirName), fpmDir)
      .catch(e => {
        console.warn("Cannot move downloaded fpm into final location (another process downloaded faster?): " + e)
      }),
    remove(archiveName),
  ])
  await BluebirdPromise.all([
    remove(tempUnpackDir),
    writeFile(path.join(fpmDir, ".lastUsed"), Date.now().toString())
  ])

  debug(`fpm downloaded to ${fpmDir}`)
  return path.join(fpmDir, "fpm")
}