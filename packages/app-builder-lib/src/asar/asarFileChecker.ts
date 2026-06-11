import * as asar from "@electron/asar"

// @electron/asar v4 no longer exports its filesystem entry types from the package root, so derive them from `statFile`'s return type.
type FilesystemEntry = ReturnType<(typeof import("@electron/asar"))["statFile"]>
type FilesystemFileEntry = Extract<FilesystemEntry, { size: number }>

export function checkFileInArchive(asarFile: string, relativeFile: string, messagePrefix: string): FilesystemEntry {
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
