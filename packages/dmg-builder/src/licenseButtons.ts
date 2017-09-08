import * as path from "path"
import { PackageBuilder } from "builder-util/out/api"
import { langIdToName, toLangWithRegion } from "builder-util/out/langs"
import { getDefaultButtons } from "./licenseDefaultButtons"
import { readFile } from "fs-extra-p"
import { parseJson } from "builder-util-runtime"
import _debug from "debug"
export const debug = _debug("electron-builder")

export async function getLicenseButtonsFile(packager: PackageBuilder): Promise<Array<LicenseButtonsFile>> {
  const files = (await packager.resourceList)
    .filter(it => {
      const name = it.toLowerCase()
      return name.startsWith("licensebuttons_") && name.endsWith(".json")
    })
    .sort((a, b) => {
      const aW = a.includes("_en") ? 0 : 100
      const bW = b.includes("_en") ? 0 : 100
      return aW === bW ? a.localeCompare(b) : aW - bW
    })

  return files.map(file => {
    let lang = file.match(/_([^.]+)\./)![1]
    let langWithRegion
    if (lang.includes("_")) {
      langWithRegion = lang
      lang = langWithRegion.substring(0, lang.indexOf("_"))
    }
    else {
      lang = lang.toLowerCase()
      langWithRegion = toLangWithRegion(lang)
    }
    return {file: path.join(packager.buildResourcesDir, file), lang, langWithRegion, langName: (langIdToName as any)[lang]}
  })
}

export interface LicenseButtonsFile {
  file: string
  lang: string
  langWithRegion: string
  langName: string
}

export async function getLicenseButtons(licenseButtonFiles: Array<LicenseButtonsFile>, langWithRegion: string, id: number, name: string) {
  let data = getDefaultButtons(langWithRegion, id, name)

  for (const item of licenseButtonFiles) {
    if (item.langWithRegion === langWithRegion) {
      try {
        const fileData = await parseJson(readFile(item.file, "utf-8"))
        const buttonsStr = fileData.lang + `\n` + fileData.agree + `\n` + fileData.disagree + `\n` + fileData.print + `\n` + fileData.save + `\n` + fileData.description

        debug("Overwriting the " + item.langName + " license buttons")

        data = `data 'STR#' (${id}, "${name}") {`
        data += serializeString((Buffer.from(buttonsStr)).toString("hex"))
        data += `};`

        return data
      } catch ($e) {
        return data
      }
    }
  }

  return data
}

function serializeString(data: string) {
  return '  $"' + data.match(/.{1,32}/g)!!.map(it => it.match(/.{1,4}/g)!!.join(" ")).join('"\n  $"') + '"'
}