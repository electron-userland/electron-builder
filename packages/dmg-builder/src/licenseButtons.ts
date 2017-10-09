import { PackageBuilder } from "builder-util/out/api"
import { getLicenseAssets } from "builder-util/out/license"
import _debug from "debug"
import { readFile } from "fs-extra-p"
import * as iconv from "iconv-lite"
import { safeLoad } from "js-yaml"
import { serializeString } from "./dmgUtil"
import { getDefaultButtons } from "./licenseDefaultButtons"

export const debug = _debug("electron-builder")

export async function getLicenseButtonsFile(packager: PackageBuilder): Promise<Array<LicenseButtonsFile>> {
  return getLicenseAssets((await packager.resourceList)
    .filter(it => {
      const name = it.toLowerCase()
      // noinspection SpellCheckingInspection
      return name.startsWith("licensebuttons_") && (name.endsWith(".json") || name.endsWith(".yml"))
    }), packager)
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
    if (item.langWithRegion !== langWithRegion) {
      continue
    }

    try {
      const fileData = safeLoad(await
        readFile(item.file, "utf-8")
      )
      const buttonsStr = labelToHex(fileData.lang, item.lang, item.langWithRegion) +
        labelToHex(fileData.agree, item.lang, item.langWithRegion) +
        labelToHex(fileData.disagree, item.lang, item.langWithRegion) +
        labelToHex(fileData.print, item.lang, item.langWithRegion) +
        labelToHex(fileData.save, item.lang, item.langWithRegion) +
        labelToHex(fileData.description, item.lang, item.langWithRegion)

      data = `data 'STR#' (${id}, "${name}") {\n`
      data += serializeString("0006" + buttonsStr)
      data += `\n};`

      if (debug.enabled) {
        debug(`Overwriting the ${item.langName} license buttons:\n${data}`)
      }
      return data
    }
    catch (e) {
      debug(`!Error while overwriting buttons: ${e}`)
      return data
    }
  }

  return data
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
  const macCodePages = getMacCodePage(lang, langWithRegion)
  let result = ""

  for (let i = 0; i < str.length; i++) {
    try {
      let hex = getMacHexCode(str, i, macCodePages)
      if (hex === undefined) {
        hex = "3F" //?
      }
      result += hex
    }
    catch (e) {
      debug(`there was a problem while trying to convert a char (${str[i]}) to hex: ${e}`)
      result += "3F" //?
    }
  }

  return result
}

function getMacCodePage(lang: string, langWithRegion: string) {
  switch (lang) {
    case "ja": //japanese
      return ["euc-jp"] //Apple Japanese
    case "zh": //chinese
      if (langWithRegion === "zh_CN") {
        return ["gb2312"] //Apple Simplified Chinese (GB 2312)
      }
      return ["big5"] //Apple Traditional Chinese (Big5)
    case "ko": //korean
      return ["euc-kr"] //Apple Korean
    case "ar": //arabic
    case "ur": //urdu
      return ["macarabic"] //Apple Arabic
    case "he": //hebrew
      return ["machebrew"] //Apple Hebrew
    case "el": //greek
    case "elc": //greek
      return ["macgreek"] //Apple Greek
    case "ru": //russian
    case "be": //belarussian
    case "sr": //serbian
    case "bg": //bulgarian
    case "uz": //uzbek
      return ["maccyrillic"] //Apple Macintosh Cyrillic
    case "ro": //romanian
      return ["macromania"] //Apple Romanian
    case "uk": //ukrainian
      return ["macukraine"] //Apple Ukrainian
    case "th": //thai
      return ["macthai"] //Apple Thai
    case "et": //estonian
    case "lt": //lithuanian
    case "lv": //latvian
    case "pl": //polish
    case "hu": //hungarian
    case "cs": //czech
    case "sk": //slovak
      return ["maccenteuro"] //Apple Macintosh Central Europe
    case "is": //icelandic
    case "fo": //faroese
      return ["maciceland"] //Apple Icelandic
    case "tr": //turkish
      return ["macturkish"] //Apple Turkish
    case "hr": //croatian
    case "sl": //slovenian
      return ["maccroatian"] //Apple Croatian
    default:
      return ["macroman"] //Apple Macintosh Roman
  }
}

function getMacHexCode(str: string, i: number, macCodePages: any) {
  const code = str.charCodeAt(i)
  if (code < 128) {
    return code.toString(16)
  }
  else if (code < 256) {
    return iconv.encode(str[i], "macroman").toString("hex")
  }
  else {
    for (let i = 0; i < macCodePages.length; i++) {
      const result = iconv.encode(str[i], macCodePages[i]).toString("hex")
      if (result !== undefined) {
        return result
      }
    }
  }
  return code
}