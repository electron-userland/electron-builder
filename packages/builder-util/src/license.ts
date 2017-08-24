import * as path from "path"
import { PackageBuilder } from "./api"
import { langIdToName, toLangWithRegion } from "./langs"

export async function getLicenseFiles(packager: PackageBuilder): Promise<Array<LicenseFile>> {
  const files = (await packager.resourceList)
    .filter(it => {
      const name = it.toLowerCase()
      return (name.startsWith("license_") || name.startsWith("eula_")) && (name.endsWith(".rtf") || name.endsWith(".txt"))
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

export interface LicenseFile {
  file: string
  lang: string
  langWithRegion: string
  langName: string
}