import { statOrNull } from "builder-util/out/fs"
import { Node, readAsar } from "./asar"

/** @internal */
export async function checkFileInArchive(asarFile: string, relativeFile: string, messagePrefix: string) {
  function error(text: string) {
    return new Error(`${messagePrefix} "${relativeFile}" in the "${asarFile}" ${text}`)
  }

  let fs
  try {
    fs = await readAsar(asarFile)
  }
  catch (e) {
    throw error(`is corrupted: ${e}`)
  }

  let stat: Node | null
  try {
    stat = fs.getFile(relativeFile)
  }
  catch (e) {
    const fileStat = await statOrNull(asarFile)
    if (fileStat == null) {
      throw error(`does not exist. Seems like a wrong configuration.`)
    }

    // asar throws error on access to undefined object (info.link)
    stat = null
  }

  if (stat == null) {
    throw error(`does not exist. Seems like a wrong configuration.`)
  }
  if (stat.size === 0) {
    throw error(`is corrupted: size 0`)
  }
}
