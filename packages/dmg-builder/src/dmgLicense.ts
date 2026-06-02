import { PlatformPackager } from "app-builder-lib"
import { getLicenseFiles } from "app-builder-lib/out/util/license"
import { readFile, readJson } from "fs-extra"
import { CORE_SCHEMA, load } from "js-yaml"
import { getLicenseButtonsFile } from "./licenseButtons"

export type DmgBuildLicenseConfig = {
  "default-language": string
  licenses: Record<string, string>
  buttons?: Record<
    string,
    {
      language?: string
      agree?: string
      disagree?: string
      print?: string
      save?: string
      message?: string
    }
  >
}

export async function addLicenseToDmg(packager: PlatformPackager<any>): Promise<DmgBuildLicenseConfig | null> {
  const licenseFiles = await getLicenseFiles(packager)
  if (licenseFiles.length === 0) {
    return null
  }

  const licenseButtonFiles = await getLicenseButtonsFile(packager)
  packager.debugLogger.add("dmg.licenseFiles", licenseFiles)
  packager.debugLogger.add("dmg.licenseButtons", licenseButtonFiles)

  const licenses: Record<string, string> = {}
  for (const file of licenseFiles) {
    licenses[file.langWithRegion] = file.file
  }

  const result: DmgBuildLicenseConfig = {
    "default-language": licenseFiles[0].langWithRegion,
    licenses,
  }

  if (licenseButtonFiles.length > 0) {
    const buttons: DmgBuildLicenseConfig["buttons"] = {}
    for (const button of licenseButtonFiles) {
      const filepath = button.file
      const raw: any = filepath.endsWith(".yml") ? load(await readFile(filepath, "utf-8"), { schema: CORE_SCHEMA }) : await readJson(filepath)

      const entry: Record<string, string> = {}
      if (raw.languageName != null) {
        entry.language = raw.languageName
      }
      if (raw.agree != null) {
        entry.agree = raw.agree
      }
      if (raw.disagree != null) {
        entry.disagree = raw.disagree
      }
      if (raw.print != null) {
        entry.print = raw.print
      }
      if (raw.save != null) {
        entry.save = raw.save
      }
      // support legacy `description` field as well as `message`
      const msg = raw.message ?? raw.description
      if (msg != null) {
        entry.message = msg
      }

      buttons[button.langWithRegion] = entry
    }
    result.buttons = buttons
  }

  return result
}
