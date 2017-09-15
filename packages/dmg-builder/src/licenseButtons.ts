import * as path from "path"
import { PackageBuilder } from "builder-util/out/api"
import { langIdToName, toLangWithRegion } from "builder-util/out/langs"
import { getDefaultButtons } from "./licenseDefaultButtons"
import { readFile } from "fs-extra-p"
import { parseJson } from "builder-util-runtime"
import _debug from "debug"
export const debug = _debug("electron-builder")
const iconv = require("iconv-lite")

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
  let hex
  let i
  const macCodePages = getMacCodePage(lang, langWithRegion)
  let result = ""

  for (i = 0; i < str.length; i++) {
    try {
      hex = getMacHexCode(str, i, macCodePages)
      if (hex === undefined) {
        hex = "3F" //?
      }

      result += hex
    } catch (e) {
      debug("there was a problem while trying to convert a char (" + str[i] + ") to hex: " + e)
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
  let code = str.charCodeAt(i)
  let j
  if (code < 128) {
    return code.toString(16)
  }
  else if (code < 256) {
    code = iconv.encode(str[i], "macroman").toString("hex")
  }
  else {
    for (j = 0; j < macCodePages.length; j++) {
      code = iconv.encode(str[i], macCodePages[j]).toString("hex")
      if (code !== undefined) {
        break
      }
    }
  }

  return code
}