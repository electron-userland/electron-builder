import * as asar from "@electron/asar"
import fs from "fs-extra"
import { type Node, readAsarHeader } from "./asar.js"
import { expectedArchiveSize, verifyPackedContent } from "./asarAlign.js"

// Entry types come from the return type of `statFile`.
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

  // `statFile` reads only the 8-byte size prefix and the header: it calls `readFilesystemSync` (https://github.com/electron/asar/blob/fde819a/src/asar.ts#L341-L348),
  // which reads the header through `readArchiveHeaderSync` (https://github.com/electron/asar/blob/fde819a/src/disk.ts#L324-L346). An archive whose bytes
  // drifted from its header therefore still passes the checks above, so compare the archive size with the size the header describes.
  // Equal-size drift (bytes changed in place) passes that comparison, so the packed content is also hashed against the header.
  const { header, size: headerSize } = await readAsarHeader(asarFile)
  const parsedHeader = JSON.parse(header) as Node
  const expectedSize = expectedArchiveSize(parsedHeader, headerSize)
  const actualSize = (await fs.stat(asarFile)).size
  if (actualSize !== expectedSize) {
    throw error(`is corrupted: the header describes an archive of ${expectedSize} bytes, but it is ${actualSize} bytes`)
  }
  try {
    await verifyPackedContent(asarFile, parsedHeader, headerSize)
  } catch (e: any) {
    throw error(`is corrupted: ${e.message}`)
  }
  return stat
}
