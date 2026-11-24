import { decodeCscLinkBase64, InvalidConfigurationError, resolveCscLinkPath, statOrNull } from "builder-util"

import { TmpDir } from "temp-file"
import { BUILD_CHANGES_URL } from "../util/config/legacyOptions.js"
import { download } from "../util/electronGet.js"
import _fsExtra from "fs-extra"
const { outputFile } = _fsExtra

/** @private */
export async function importCertificate(cscLink: string, tmpDir: TmpDir, currentDir: string): Promise<string> {
  cscLink = cscLink.trim()

  if (cscLink.startsWith("https://")) {
    const url = new URL(cscLink)
    // fetch refuses a url with user info, and its error would print the link with them
    if (url.username || url.password) {
      throw new InvalidConfigurationError(
        "A certificate link (cscLink, cscInstallerLink, CSC_LINK, WIN_CSC_LINK or CSC_INSTALLER_LINK) is an https URL with user info (`user:password@`), " +
          "which electron-builder 27 no longer downloads (the link is not shown). Use a pre-signed URL, a file path or a base64 value instead. " +
          `See ${BUILD_CHANGES_URL}#certificate-links-with-user-info-are-rejected`
      )
    }
    const tempFile = await tmpDir.getTempFile({ suffix: ".p12" })
    // CSC_LINK is the caller's own certificate — no pre-known hash is possible.
    await download(cscLink, tempFile, null)
    return tempFile
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
