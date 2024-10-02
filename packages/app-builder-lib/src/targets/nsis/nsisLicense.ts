import { log } from "builder-util"
import { lcid } from "../../util/langs"
import { getLicenseFiles, getNotLocalizedLicenseFile } from "../../util/license"
import * as path from "path"
import { WinPackager } from "../../winPackager"
import { NsisOptions } from "./nsisOptions"
import { NsisScriptGenerator } from "./nsisScriptGenerator"
import { nsisTemplatesDir } from "./nsisUtil"
import * as fs from "fs"

function convertFileToUtf8WithBOMSync(filePath: string): boolean {
  try {
    const UTF8_BOM_HEADER = Buffer.from([0xef, 0xbb, 0xbf])
    const data = fs.readFileSync(filePath)

    // Check if the file already starts with a UTF-8 BOM
    log.debug({ file: log.filePath(filePath) }, "checking file for BOM header")
    if (data.length >= UTF8_BOM_HEADER.length && data.subarray(0, UTF8_BOM_HEADER.length).equals(UTF8_BOM_HEADER)) {
      log.debug({ file: log.filePath(filePath) }, "file is already in BOM format, skipping conversion.")
      return true
    }

    // If not, add the BOM
    const dataWithBOM = Buffer.concat([UTF8_BOM_HEADER, data])
    fs.writeFileSync(filePath, dataWithBOM)
    log.debug({ file: log.filePath(filePath) }, "file successfully converted to UTF-8 with BOM")
    return true
  } catch (err: any) {
    log.error({ file: log.filePath(filePath), message: err.message ?? err.stack }, "unable to convert file to UTF-8 with BOM")
    return false
  }
}

export async function computeLicensePage(packager: WinPackager, options: NsisOptions, scriptGenerator: NsisScriptGenerator, languages: Array<string>): Promise<void> {
  const license = await getNotLocalizedLicenseFile(options.license, packager)
  if (license != null) {
    let licensePage: Array<string>
    if (license.endsWith(".html")) {
      licensePage = [
        "!define MUI_PAGE_CUSTOMFUNCTION_SHOW LicenseShow",
        "Function LicenseShow",
        "  FindWindow $R0 `#32770` `` $HWNDPARENT",
        "  GetDlgItem $R0 $R0 1000",
        "EmbedHTML::Load /replace $R0 file://$PLUGINSDIR\\license.html",
        "FunctionEnd",

        `!insertmacro MUI_PAGE_LICENSE "${path.join(nsisTemplatesDir, "empty-license.txt")}"`,
      ]
    } else {
      licensePage = [`!insertmacro MUI_PAGE_LICENSE "${license}"`]
    }

    scriptGenerator.macro("licensePage", licensePage)
    if (license.endsWith(".html")) {
      scriptGenerator.macro("addLicenseFiles", [`File /oname=$PLUGINSDIR\\license.html "${license}"`])
    }
    return
  }

  const licenseFiles = await getLicenseFiles(packager)
  if (licenseFiles.length === 0) {
    return
  }

  const licensePage: Array<string> = []
  const unspecifiedLangs = new Set(languages)

  let defaultFile: string | null = null
  for (const item of licenseFiles) {
    unspecifiedLangs.delete(item.langWithRegion)
    convertFileToUtf8WithBOMSync(item.file)
    if (defaultFile == null) {
      defaultFile = item.file
    }
    licensePage.push(`LicenseLangString MUILicense ${lcid[item.langWithRegion] || item.lang} "${item.file}"`)
  }

  for (const l of unspecifiedLangs) {
    licensePage.push(`LicenseLangString MUILicense ${lcid[l]} "${defaultFile}"`)
  }

  licensePage.push('!insertmacro MUI_PAGE_LICENSE "$(MUILicense)"')
  scriptGenerator.macro("licensePage", licensePage)
}
