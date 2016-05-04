import { statOrNull, spawn, debug } from "./util"
import { emptyDir, move, remove } from "fs-extra-p"
import { download } from "./httpRequest"
import { path7za } from "7zip-bin"
import * as path from "path"
import { tmpdir } from "os"
import { Promise as BluebirdPromise } from "bluebird"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

let tmpDirCounter = 0

function getTempName(prefix?: string | n): string {
  return `${prefix == null ? "" : prefix + "-"}${process.pid}-${tmpDirCounter++}-${Date.now()}`
}

const versionToPromise = new Map<string, BluebirdPromise<string>>()

// can be called in parallel, all calls for the same version will get the same promise - will be downloaded only once
export function downloadFpm(version: string): Promise<string> {
  let promise = versionToPromise.get(version)
  // if rejected, we will try to download again
  if (<any>promise != null && !promise!.isRejected()) {
    return promise!
  }

  promise = <BluebirdPromise<string>>doDownloadFpm(version)
  versionToPromise.set(version, promise)
  return promise
}

async function doDownloadFpm(version: string): Promise<string> {
  const dirName = `fpm-${version}-osx`
  const url = `https://github.com/develar/fpm-self-contained/releases/download/v${version}/${dirName}.7z`
  const cache = path.join(__dirname, "..",  "node_modules", ".fpm")
  const fpmDir = path.join(cache, dirName)

  const stat = await statOrNull(fpmDir)
  if (stat != null && stat.isDirectory()) {
    return path.join(fpmDir, "fpm")
  }

  // the only version currently supported (i.e. all clients are consumed the same version
  await emptyDir(cache)

  const archiveName = path.join(tmpdir(), getTempName("fpm-download") + ".7z")
  await download(url, archiveName)
  const tempUnpackDir = path.join(cache, getTempName())
  await spawn(path7za, ["x", archiveName, "-o" + tempUnpackDir, "-bb" + (debug.enabled ? "3" : "0"), "-bd"], {
    cwd: cache,
    stdio: ["ignore", "inherit", "inherit"],
  })

  await move(path.join(tempUnpackDir, dirName), fpmDir, {clobber: true})
  await BluebirdPromise.all([remove(tempUnpackDir), remove(archiveName)])

  return path.join(fpmDir, "fpm")
}