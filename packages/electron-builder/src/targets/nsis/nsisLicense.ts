import * as path from "path"
import { NsisOptions } from "../../options/winOptions"
import { WinPackager } from "../../winPackager"
import { bundledLanguages, getLicenseFiles, lcid } from "../license"
import { createMacro, nsisTemplatesDir } from "./nsisUtil"

export async function  computeLicensePage(packager: WinPackager, options: NsisOptions): Promise<string | null> {
  const possibleFiles: Array<string> = []
  for (const name of ["license", "eula"]) {
    for (const ext of ["rtf", "txt", "html"]) {
      possibleFiles.push(`${name}.${ext}`)
      possibleFiles.push(`${name.toUpperCase()}.${ext}`)
      possibleFiles.push(`${name}.${ext.toUpperCase()}`)
      possibleFiles.push(`${name.toUpperCase()}.${ext.toUpperCase()}`)
    }
  }

  const license = await packager.getResource(options.license, ...possibleFiles)
  if (license != null) {
    const licensePage = [`!insertmacro MUI_PAGE_LICENSE "${path.join(nsisTemplatesDir, "empty-license.txt")}"`]
    if (license.endsWith(".html")) {
      licensePage.unshift(
        "!define MUI_PAGE_CUSTOMFUNCTION_SHOW LicenseShow",
        "Function LicenseShow",
        "  FindWindow $R0 `#32770` `` $HWNDPARENT",
        "  GetDlgItem $R0 $R0 1000",
        "EmbedHTML::Load /replace $R0 file://$PLUGINSDIR\\license.html",
        "FunctionEnd",
      )
    }

    let result = createMacro("licensePage", licensePage)
    if (license.endsWith(".html")) {
      result += "\n" + createMacro("addLicenseFiles", [`File /oname=$PLUGINSDIR\\license.html "${license}"`])
    }
    return result
  }

  const licenseFiles = await getLicenseFiles(packager)
  if (licenseFiles.length === 0) {
    return null
  }

  const licensePage: Array<string> = []
  const unspecifiedLangs = new Set(bundledLanguages)

  let defaultFile: string | null = null
  for (const item of licenseFiles) {
    unspecifiedLangs.delete(item.langWithRegion)
    if (defaultFile == null) {
      defaultFile = item.file
    }
    licensePage.push(`LicenseLangString MUILicense ${lcid[item.langWithRegion] || item.lang} "${item.file}"`)
  }

  for (const l of unspecifiedLangs) {
    licensePage.push(`LicenseLangString MUILicense ${lcid[l]} "${defaultFile}"`)
  }

  licensePage.push('!insertmacro MUI_PAGE_LICENSE "$(MUILicense)"')
  return createMacro("licensePage", licensePage)
}
