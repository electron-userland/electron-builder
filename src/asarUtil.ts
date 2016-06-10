import { AsarFileInfo, listPackage, statFile, AsarOptions, AsarFileMetadata, createPackageFromFiles } from "asar"
import { statOrNull } from "./util"
import { Glob } from "glob"
import { lstat, remove } from "fs-extra-p"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export async function createAsarArchive(src: string, resourcesPath: string, options: AsarOptions): Promise<any> {
  // dot: true as in the asar by default by we use glob default - do not copy hidden files
  let glob: Glob | null = null
  const files = (await new BluebirdPromise<Array<string>>((resolve, reject) => {
    glob = new Glob("**/*", {
      cwd: src,
    }, (error, matches) => {
      if (error == null) {
        resolve(matches)
      }
      else {
        reject(error)
      }
    })
  })).map(it => path.join(src, it))

  const metadata: { [key: string]: AsarFileMetadata; } = {}

  // https://github.com/electron-userland/electron-builder/issues/482#issuecomment-225100630
  const stats = await BluebirdPromise.map(files, it => {
    const systemIndependentPath = process.platform === "win32" ? it.replace(/\\/g, "/") : it
    if (glob!.symlinks[systemIndependentPath]) {
      // asar doesn't use stat for link
      metadata[it] = {
        type: "link",
      }
      return null
    }

    const cachedType = glob!.cache[systemIndependentPath]
    if (cachedType == null || cachedType === "FILE") {
      const stat = glob!.statCache[systemIndependentPath]
      return stat == null ? lstat(it) : <any>stat
    }
    else {
      // asar doesn't use stat for dir
      metadata[it] = {
        type: "directory",
      }
    }
    return null
  })

  for (let i = 0, n = files.length; i < n; i++) {
    const stat = stats[i]
    if (stat != null) {
      metadata[files[i]] = {
        type: stat.isFile() ? "file" : (stat.isDirectory() ? "directory" : "link"),
        stat: stat,
      }
    }
  }

  await BluebirdPromise.promisify(createPackageFromFiles)(src, path.join(resourcesPath, "app.asar"), files, metadata, options)
  await remove(src)
}

export async function checkFileInPackage(asarFile: string, relativeFile: string) {
  let stat: AsarFileInfo | null
  try {
    stat = statFile(asarFile, relativeFile)
  }
  catch (e) {
    const fileStat = await statOrNull(asarFile)
    if (fileStat == null) {
      throw new Error(`File "${asarFile}" does not exist. Seems like a wrong configuration.`)
    }

    try {
      listPackage(asarFile)
    }
    catch (e) {
      throw new Error(`File "${asarFile}" is corrupted: ${e}`)
    }

    // asar throws error on access to undefined object (info.link)
    stat = null
  }

  if (stat == null) {
    throw new Error(`Application entry file "${relativeFile}" in the "${asarFile}" does not exist. Seems like a wrong configuration.`)
  }
  if (stat.size === 0) {
    throw new Error(`Application entry file "${relativeFile}" in the "${asarFile}" is corrupted: size 0`)
  }
}