// import BluebirdPromise from "bluebird-lst"
// import { createHash } from "crypto"
// import { createReadStream } from "fs"
import { readdir } from "fs/promises"
import * as path from "path"
// import { readAsarHeader, NodeIntegrity } from "./asarFilesystem"
import asar from 'asar'

export interface AsarIntegrityOptions {
  readonly resourcesPath: string
  readonly resourcesRelativePath: string
}

export interface AsarIntegrity {
  [key: string]: asar.ArchiveHeader
}

export async function computeData({ resourcesPath, resourcesRelativePath }: AsarIntegrityOptions): Promise<AsarIntegrity> {
  // sort to produce constant result
  const names = (await readdir(resourcesPath)).filter(it => it.endsWith(".asar")).sort()
  const checksums = await Promise.all(names.map(it => asar.getRawHeader(path.join(resourcesPath, it))))

  const result: AsarIntegrity = {}
  for (let i = 0; i < names.length; i++) {
    result[path.join(resourcesRelativePath, names[i])] = checksums[i]
  }
  return result
}

/** @internal */
export async function checkFileInArchive(asarFile: string, relativeFile: string, messagePrefix: string) {
  function error(text: string) {
    return new Error(`${messagePrefix} "${relativeFile}" in the "${asarFile}" ${text}`)
  }
  let stat: asar.FileMetadata
  try {
    stat = asar.statFile(asarFile, relativeFile, true) as asar.FileMetadata
  } catch (e) {
    throw error(`is corrupted: ${e}`)
  }
  if (stat.size === 0) {
    throw error(`is corrupted: size 0`)
  }
  return stat
}
