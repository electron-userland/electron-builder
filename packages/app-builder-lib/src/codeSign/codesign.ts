import { outputFile } from "fs-extra"
import { homedir } from "os"
import * as path from "path"
import { TmpDir } from "temp-file"
import { InvalidConfigurationError } from "builder-util"
import { statOrNull } from "builder-util/out/fs"
import { download } from "../binDownload"

/** @private */
export async function importCertificate(cscLink: string, tmpDir: TmpDir, currentDir: string): Promise<string> {
  cscLink = cscLink.trim()

  let file: string | null = null
  if ((cscLink.length > 3 && cscLink[1] === ":") || cscLink.startsWith("/") || cscLink.startsWith(".")) {
    file = cscLink
  } else if (cscLink.startsWith("file://")) {
    file = cscLink.substring("file://".length)
  } else if (cscLink.startsWith("~/")) {
    file = path.join(homedir(), cscLink.substring("~/".length))
  } else if (cscLink.startsWith("https://")) {
    const tempFile = await tmpDir.getTempFile({ suffix: ".p12" })
    await download(cscLink, tempFile)
    return tempFile
  } else {
    const mimeType = /data:.*;base64,/.exec(cscLink)?.[0]
    if (mimeType || cscLink.length > 2048 || cscLink.endsWith("=")) {
      const tempFile = await tmpDir.getTempFile({ suffix: ".p12" })
      await outputFile(tempFile, Buffer.from(cscLink.substring(mimeType?.length ?? 0), "base64"))
      return tempFile
    }
    file = cscLink
  }

  file = path.resolve(currentDir, file)
  const stat = await statOrNull(file)
  if (stat == null) {
    throw new InvalidConfigurationError(`${file} doesn't exist`)
  } else if (!stat.isFile()) {
    throw new InvalidConfigurationError(`${file} not a file`)
  } else {
    return file
  }
}
