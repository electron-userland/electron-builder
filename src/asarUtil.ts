import { AsarFileInfo, listPackage, statFile, AsarOptions, AsarFileMetadata, createPackageFromFiles } from "asar-electron-builder"
import { statOrNull } from "./util/util"
import { lstat, readdir } from "fs-extra-p"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import { Stats } from "fs"
import pathSorter = require("path-sort")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./util/awaiter")

const concurrency = {concurrency: 50}

function walk(dirPath: string, consumer: (file: string, stat: Stats) => void, filter: (file: string) => boolean): BluebirdPromise<any> {
  return readdir(dirPath)
    .then(names => {
      return BluebirdPromise.map(names, name => {
        const filePath = dirPath + path.sep + name
        if (!filter(filePath)) {
          return <any>null
        }

        return lstat(filePath)
          .then(stat => {
            consumer(filePath, stat)
            if (stat.isDirectory()) {
              return walk(filePath, consumer, filter)
            }
            return null
          })
      }, concurrency)
    })
}

export async function createAsarArchive(src: string, resourcesPath: string, options: AsarOptions, filter: (file: string) => boolean): Promise<any> {
  const metadata: { [key: string]: AsarFileMetadata; } = {}
  const files: Array<string> = []
  await walk(src, (it, stat) => {
      files.push(it)
      metadata[it] = {
        type: stat.isFile() ? "file" : (stat.isDirectory() ? "directory" : "link"),
        stat: stat,
      }
    },
    filter)

  // sort files to minimize file change (i.e. asar file is not changed dramatically on small change)
  await BluebirdPromise.promisify(createPackageFromFiles)(src, path.join(resourcesPath, "app.asar"), pathSorter(files), metadata, options)
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