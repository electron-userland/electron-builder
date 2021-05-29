import { log } from "builder-util"
import { load } from "js-yaml"
import { PlatformPackager } from "app-builder-lib"
import { getLicenseFiles } from "app-builder-lib/out/util/license"
import { readFile, readJson } from "fs-extra"
import { getLicenseButtonsFile } from "./licenseButtons"
import { dmgLicenseFromJSON } from "dmg-license"

// License Specifications
// https://github.com/argv-minus-one/dmg-license/blob/HEAD/docs/License%20Specifications.md
type LicenseConfig = {
  $schema: string
  body: any[]
  labels: any[]
}

export async function addLicenseToDmg(packager: PlatformPackager<any>, dmgPath: string): Promise<LicenseConfig | null> {
  const licenseFiles = await getLicenseFiles(packager)
  if (licenseFiles.length === 0) {
    return null
  }

  const licenseButtonFiles = await getLicenseButtonsFile(packager)
  packager.debugLogger.add("dmg.licenseFiles", licenseFiles)
  packager.debugLogger.add("dmg.licenseButtons", licenseButtonFiles)

  const jsonFile: LicenseConfig = {
    $schema: "https://github.com/argv-minus-one/dmg-license/raw/master/schema.json",
    // defaultLang: '',
    body: [],
    labels: [],
  }

  for (const file of licenseFiles) {
    jsonFile.body.push({
      file: file.file,
      lang: file.langWithRegion.replace("_", "-"),
    })
  }

  for (const button of licenseButtonFiles) {
    const filepath = button.file
    const label = filepath.endsWith(".yml") ? load(await readFile(filepath, "utf-8")) : await readJson(filepath)
    if (label.description) {
      // to support original button file format
      label.message = label.description
      delete label.description
    }
    jsonFile.labels.push(
      Object.assign(
        {
          lang: button.langWithRegion.replace("_", "-"),
        },
        label
      )
    )
  }

  await dmgLicenseFromJSON(dmgPath, jsonFile, {
    onNonFatalError: log.warn.bind(log),
  })

  return jsonFile
}
