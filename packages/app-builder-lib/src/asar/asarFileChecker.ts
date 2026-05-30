import type { FilesystemEntry, FilesystemFileEntry } from "@electron/asar/lib/filesystem"
import { dynamicImport } from "../util/dynamicImport"

export async function checkFileInArchive(asarFile: string, relativeFile: string, messagePrefix: string) {
  const asar = await dynamicImport<typeof import("@electron/asar")>("@electron/asar")
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
  return stat
}
