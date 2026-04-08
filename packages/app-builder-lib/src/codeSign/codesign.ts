<<<<<<< HEAD
import { decodeCscLinkBase64, InvalidConfigurationError, resolveCscLinkPath, statOrNull } from "builder-util"

=======
import { InvalidConfigurationError, statOrNull } from "builder-util"
import fsExtra from "fs-extra"
import { homedir } from "os"
import * as path from "path"
>>>>>>> 8a2e4e97f (tmp save. migrating fs-extra to namespace import)
import { TmpDir } from "temp-file"
import { download } from "../binDownload.js"
<<<<<<< HEAD
import _fsExtra from "fs-extra"
const { outputFile } = _fsExtra
=======
>>>>>>> d26567f58 (tmp save)

/** @private */
export async function importCertificate(cscLink: string, tmpDir: TmpDir, currentDir: string): Promise<string> {
  cscLink = cscLink.trim()

  if (cscLink.startsWith("https://")) {
    const tempFile = await tmpDir.getTempFile({ suffix: ".p12" })
    await download(cscLink, tempFile)
    return tempFile
<<<<<<< HEAD
=======
  } else {
    const mimeType = /data:.*;base64,/.exec(cscLink)?.[0]
    if (mimeType || cscLink.length > 2048 || cscLink.endsWith("=")) {
      const tempFile = await tmpDir.getTempFile({ suffix: ".p12" })
      await fsExtra.outputFile(tempFile, Buffer.from(cscLink.substring(mimeType?.length ?? 0), "base64"))
      return tempFile
    }
    file = cscLink
>>>>>>> 8a2e4e97f (tmp save. migrating fs-extra to namespace import)
  }

  const decoded = decodeCscLinkBase64(cscLink)
  if (decoded) {
    const tempFile = await tmpDir.getTempFile({ suffix: ".p12" })
    await outputFile(tempFile, decoded)
    return tempFile
  }

  const file = resolveCscLinkPath(cscLink, currentDir)
  const stat = await statOrNull(file)
  if (stat == null) {
    throw new InvalidConfigurationError(`${file} doesn't exist`)
  } else if (!stat.isFile()) {
    throw new InvalidConfigurationError(`${file} not a file`)
  } else {
    return file
  }
}
