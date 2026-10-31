import * as asar from "@electron/asar"
import fs from "fs-extra"
import { type Node, readAsarHeader } from "./asar.js"
import { collectPackedFiles, type PackedFile } from "./asarAlign.js"

// @electron/asar v4 no longer exports its filesystem entry types from the package root, so derive them from `statFile`'s return type.
type FilesystemEntry = ReturnType<typeof asar.statFile>
type FilesystemFileEntry = Extract<FilesystemEntry, { size: number }>

export async function checkFileInArchive(asarFile: string, relativeFile: string, messagePrefix: string): Promise<FilesystemEntry> {
  function error(text: string) {
    return new Error(`${messagePrefix} "${relativeFile}" in the "${asarFile}" ${text}`)
  }
  let stat: FilesystemEntry
  try {
    stat = asar.statFile(asarFile, relativeFile, false)
  } catch (e: any) {
    if (e.message.includes("Cannot read properties of undefined (reading 'link')")) {
      throw error("does not exist. Seems like a wrong configuration.")
    }
    throw error(`is corrupted: ${e}`)
  }
  if ((stat as FilesystemFileEntry).size === 0) {
    throw error(`is corrupted: size 0`)
  }

  // `statFile` reads only the header, so an archive whose bytes drifted from it still passes the checks above. File content starts after the 8-byte size
  // and the header (https://github.com/electron/asar/blob/fde819a/src/disk.ts#L428), so the last packed file's end must be the end of the archive.
  const { header, size: headerSize } = await readAsarHeader(asarFile)
  const packedFiles: Array<PackedFile> = []
  collectPackedFiles(JSON.parse(header) as Node, packedFiles)
  const expectedSize = 8 + headerSize + packedFiles.reduce((end, file) => Math.max(end, file.offset + file.size), 0)
  const actualSize = (await fs.stat(asarFile)).size
  if (actualSize !== expectedSize) {
    throw error(`is corrupted: the header describes an archive of ${expectedSize} bytes, but it is ${actualSize} bytes`)
  }
  return stat
}
