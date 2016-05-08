import { statOrNull, spawn, debug, debug7z } from "./util"
import { readdir, mkdirs, move, remove } from "fs-extra-p"
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

  const stat = await statOrNull(fpmDir)
  if (stat != null && stat.isDirectory()) {
    debug(`Found existing fpm ${fpmDir}`)
    return path.join(fpmDir, "fpm")
  }

  // the only version currently supported (i.e. all clients are consumed the same version
  await emptyDir(cacheDir, dirName)

  // 7z cannot be extracted from the input stream, temp file is required
  const tempName = getTempName()
  const archiveName = path.join(cacheDir, tempName + ".7z")
  debug(`Download fpm from ${url} to ${archiveName}`)
  await download(url, archiveName)
  const tempUnpackDir = path.join(cacheDir, tempName)
  const args = ["x", archiveName, "-o" + tempName, "-bd"]
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

  await BluebirdPromise.all([move(path.join(tempUnpackDir, dirName), fpmDir, {clobber: true}), remove(archiveName)])
  await remove(tempUnpackDir)

  debug(`fpm downloaded to ${fpmDir}`)
  return path.join(fpmDir, "fpm")
}

// prefix to not delete dir or archived dir (.7z)
async function emptyDir(dir: string, excludeNamePrefix: string) {
  let items: string[] | null = null
  try {
    items = await readdir(dir)
  }
  catch (e) {
    await mkdirs(dir)
    return
  }

  items = items!
    .filter(it => !it.startsWith(excludeNamePrefix))
    .map(it => path.join(dir, it))

  await BluebirdPromise.map(items, remove)
}