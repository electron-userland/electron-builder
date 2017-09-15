import * as path from "path"
import { PackageBuilder } from "builder-util/out/api"
import { langIdToName, toLangWithRegion } from "builder-util/out/langs"
import { getDefaultButtons } from "./licenseDefaultButtons"
import { readFile } from "fs-extra-p"
import { parseJson } from "builder-util-runtime"
import _debug from "debug"
export const debug = _debug("electron-builder")
const cptable = require("codepage")

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
        const buttonsStr = labelToHex(fileData.lang, item.lang, item.langWithRegion) +
          labelToHex(fileData.agree, item.lang, item.langWithRegion) +
          labelToHex(fileData.disagree, item.lang, item.langWithRegion) +
          labelToHex(fileData.print, item.lang, item.langWithRegion) +
          labelToHex(fileData.save, item.lang, item.langWithRegion) +
          labelToHex(fileData.description, item.lang, item.langWithRegion)

        debug("Overwriting the " + item.langName + " license buttons")

        data = `data 'STR#' (${id}, "${name}") {\n`
        data += serializeString("0006" + buttonsStr)
        data += `\n};`

        debug("Result " + data)

        console.log(data)

        return data
      } catch ($e) {
        debug("!Error while overwriting buttons: " + $e)
        return data
      }
    }
  }

  debug("Result " + data)
  return data
}

function serializeString(data: string) {
  return '  $"' + data.match(/.{1,32}/g)!!.map(it => it.match(/.{1,4}/g)!!.join(" ")).join('"\n  $"') + '"'
}

function labelToHex(label: string, lang: string, langWithRegion: string) {
  const lbl = hexEncode(label, lang, langWithRegion).toString().toUpperCase()
  const len = numberToHex((lbl.length / 2))
  return len + lbl
}

function numberToHex(nb: number) {
  return ("0" + (nb.toString(16))).slice(-2)
}

function hexEncode(str: string, lang: string, langWithRegion: string) {
  let code
  let hex
  let i
  const macCodePages = getMacCodePage(lang, langWithRegion)
  let result = ""

  for (i = 0; i < str.length; i++) {
    try {
      code = getMacCharCode(str, i, macCodePages)
      if (code === undefined) {
        hex = "3F" //?
      } else {
        hex = code.toString(16)
      }

      result += hex
    } catch (e) {
      debug("there was a problem while trying to convert a char to hex: " + e)
      result += "3F" //?
    }
  }

  return result
}

function getMacCodePage(lang: string, langWithRegion: string) {
  switch (lang) {
    case "ja": //japanese
      return [10001] //Apple Japanese
    case "zh": //chinese
      if (langWithRegion === "zh_CN") {
        return [10008] //Apple Simplified Chinese (GB 2312)
      }
      return [10002] //Apple Traditional Chinese (Big5)
    case "ko": //korean
      return [10003] //Apple Korean
    case "ar": //arabic
    case "ur": //urdu
      return [10004] //Apple Arabic
    case "he": //hebrew
      return [10005] //Apple Hebrew
    case "el": //greek
    case "elc": //greek
      return [10006] //Apple Greek
    case "ru": //russian
    case "be": //belarussian
    case "sr": //serbian
    case "bg": //bulgarian
    case "uz": //uzbek
      return [10007] //Apple Macintosh Cyrillic
    case "ro": //romanian
      return [10010] //Apple Romanian
    case "uk": //ukrainian
      return [10017] //Apple Ukrainian
    case "th": //thai
      return [10021] //Apple Thai
    case "et": //estonian
    case "lt": //lithuanian
    case "lv": //latvian
    case "pl": //polish
    case "hu": //hungarian
    case "cs": //czech
    case "sk": //slovak
      return [10029] //Apple Macintosh Central Europe
    case "is": //icelandic
    case "fo": //faroese
      return [10079] //Apple Icelandic
    case "tr": //turkish
      return [10081] //Apple Turkish
    case "hr": //croatian
    case "sl": //slovenian
      return [10082] //Apple Croatian
    default:
      return [10000] //Apple Macintosh Roman
  }
}

function getMacCharCode(str: string, i: number, macCodePages: any) {
  let code = str.charCodeAt(i)
  let j
  if (code < 128) {
    code = str.charCodeAt(i)
  }
  else if (code < 256) {
    //codepage 10000 = mac OS Roman
    code = cptable[10000].enc[str[i]]
  }
  else {
    for (j = 0; j < macCodePages.length; j++) {
      code = cptable[macCodePages[j]].enc[str[i]]
      if (code !== undefined) {
        break
      }
    }
  }

  return code
}