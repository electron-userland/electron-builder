import { readdir } from "fs/promises"
import * as path from "path"
import * as asar from "asar"

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
  const checksums = names.map(it => asar.getRawHeader(path.join(resourcesPath, it)))

  const result: AsarIntegrity = {}
  for (let i = 0; i < names.length; i++) {
    result[path.join(resourcesRelativePath, names[i])] = checksums[i]
  }
  return result
}

/** @internal */
export function checkFileInArchive(asarFile: string, relativeFile: string, messagePrefix: string) {
  function error(text: string) {
    return new Error(`${messagePrefix} "${relativeFile}" in the "${asarFile}" ${text}`)
  }
  let stat: asar.FileMetadata
  try {
    stat = asar.statFile(asarFile, relativeFile, false) as asar.FileMetadata
  } catch (e) {
    throw error(`is corrupted: ${e}`)
  }
  if (stat.size === 0) {
    throw error(`is corrupted: size 0`)
  }
  return stat
}

export function readAsarJson(archive: string, file: string) {
  const buffer = readAsarFile(archive, file)
  return Promise.resolve(JSON.parse(buffer.toString()))
}

export function readAsarFile(archive: string, file: string) {
  return asar.extractFile(archive, file)
}

export function readAsarHeader(archive: string) {
  return asar.getRawHeader(archive)
}
