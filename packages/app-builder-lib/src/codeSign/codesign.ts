import { outputFile } from "fs-extra"
import { homedir } from "os"
import * as path from "path"
import { TmpDir } from "temp-file"
import { InvalidConfigurationError } from "builder-util"
import { statOrNull } from "builder-util/out/fs"
import { download } from "../binDownload"

/** @private */
export async function downloadCertificate(urlOrBase64: string, tmpDir: TmpDir, currentDir: string): Promise<string> {
  urlOrBase64 = urlOrBase64.trim()

  let file: string | null = null
  if ((urlOrBase64.length > 3 && urlOrBase64[1] === ":") || urlOrBase64.startsWith("/") || urlOrBase64.startsWith(".")) {
    file = urlOrBase64
  }
  else if (urlOrBase64.startsWith("file://")) {
    file = urlOrBase64.substring("file://".length)
  }
  else if (urlOrBase64.startsWith("~/")) {
    file = path.join(homedir(), urlOrBase64.substring("~/".length))
  }
  else {
    const isUrl = urlOrBase64.startsWith("https://")
    if (isUrl || urlOrBase64.length > 2048 || urlOrBase64.endsWith("=")) {
      const tempFile = await tmpDir.getTempFile({suffix: ".p12"})
      if (isUrl) {
        await download(urlOrBase64, tempFile)
      }
      else {
        await outputFile(tempFile, Buffer.from(urlOrBase64, "base64"))
      }
      return tempFile
    }
    else {
      file = urlOrBase64
    }
  }

  file = path.resolve(currentDir, file)
  const stat = await statOrNull(file)
  if (stat == null) {
    throw new InvalidConfigurationError(`${file} doesn't exist`)
  }
  else if (!stat.isFile()) {
    throw new InvalidConfigurationError(`${file} not a file`)
  }
  else {
    return file
  }
}