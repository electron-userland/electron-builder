import { exec, log } from "builder-util"
import { PlatformPackager } from "app-builder-lib"
import { getLicenseFiles } from "app-builder-lib/out/util/license"
import { outputFile, readFile } from "fs-extra"
import { serializeString } from "./dmgUtil"
import { getLicenseButtons, getLicenseButtonsFile } from "./licenseButtons"

// DropDMG/dmgbuild a in any case (even if no english, but only ru/de) set to 0 (en_US), well, without docs, just believe that's correct
const DEFAULT_REGION_CODE = 0

export async function addLicenseToDmg(packager: PlatformPackager<any>, dmgPath: string): Promise<string | null> {
  // http://www.owsiak.org/?p=700
  const licenseFiles = await getLicenseFiles(packager)
  if (licenseFiles.length === 0) {
    return null
  }

  const licenseButtonFiles = await getLicenseButtonsFile(packager)
  packager.debugLogger.add("dmg.licenseFiles", licenseFiles)
  packager.debugLogger.add("dmg.licenseButtons", licenseButtonFiles)

  const style: Array<string> = []
  const rtfs: Array<string> = []
  const defaultButtons: Array<string> = []

  let counter = 5000
  const addedRegionCodes: Array<number> = []
  for (const item of licenseFiles) {
    log.info({lang: item.langName}, "adding license")

    // value from DropDMG, data the same for any language
    // noinspection SpellCheckingInspection
    style.push(`data 'styl' (${counter}, "${item.langName}") {
  $"0001 0000 0000 000E 0011 0015 0000 000C"
  $"0000 0000 0000"
};`)

    let data = `data 'RTF ' (${counter}, "${item.langName}") {\n`
    const fileData = await readFile(item.file, "utf-8")
    const isRtf = item.file.endsWith(".rtf") || item.file.endsWith(".RTF")
    data += isRtf ? serializeString((Buffer.from(fileData)).toString("hex")) : wrapInRtf(await readFile(item.file, "utf-8"))
    data += "\n};"
    rtfs.push(data)

    defaultButtons.push(await getLicenseButtons(licenseButtonFiles, item.langWithRegion, counter, item.langName))
    addedRegionCodes.push(getRegionCode(item.langWithRegion))
    counter++
  }

  const buffer = Buffer.allocUnsafe((2 + (3 * addedRegionCodes.length)) * 2)
  let offset = 0
  buffer.writeUInt16BE(DEFAULT_REGION_CODE, offset)
  offset += 2
  buffer.writeUInt16BE(addedRegionCodes.length, offset)
  offset += 2

  for (let i = 0; i < addedRegionCodes.length; i++) {
    const regionCode = addedRegionCodes[i]
    buffer.writeUInt16BE(regionCode, offset)
    offset += 2
    buffer.writeUInt16BE(i, offset)
    offset += 2
    buffer.writeUInt16BE(/* is two byte */ [14, 51, 52, 53].includes(regionCode) ? 1 : 0, offset)
    offset += 2
  }

  const lPic = `data 'LPic' (5000) {\n${serializeString(buffer.toString("hex"))}\n};`
  const data = style
    .concat(rtfs)
    .concat(lPic)
    .concat(defaultButtons)
    .join("\n\n")

  packager.debugLogger.add("dmg.licenseResource", data)
  const tempFile = await packager.getTempFile(".r")
  await outputFile(tempFile, data)
  await exec("hdiutil", ["unflatten", dmgPath])
  await exec("Rez", ["-a", tempFile, "-o", dmgPath])
  await exec("hdiutil", ["flatten", dmgPath])

  return data
}

function getRtfUnicodeEscapedString(text: string) {
  let result = ""
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" || text[i] === "{" || text[i] === "}" || text[i] === "\n") {
      result += `\\${text[i]}`
    }
    else if (text[i] === "\r") {
      // ignore
    }
    else if (text.charCodeAt(i) <= 0x7f) {
      result += text[i]
    }
    else {
      result += `\\u${text.codePointAt(i)}?`
    }
  }
  return result
}

function wrapInRtf(text: string) {
  return `  $"7B5C 7274 6631 5C61 6E73 695C 616E 7369"
  $"6370 6731 3235 325C 636F 636F 6172 7466"
  $"3135 3034 5C63 6F63 6F61 7375 6272 7466"
  $"3833 300A 7B5C 666F 6E74 7462 6C5C 6630"
  $"5C66 7377 6973 735C 6663 6861 7273 6574"
  $"3020 4865 6C76 6574 6963 613B 7D0A 7B5C"
  $"636F 6C6F 7274 626C 3B5C 7265 6432 3535"
  $"5C67 7265 656E 3235 355C 626C 7565 3235"
  $"353B 7D0A 7B5C 2A5C 6578 7061 6E64 6564"
  $"636F 6C6F 7274 626C 3B3B 7D0A 5C70 6172"
  $"645C 7478 3536 305C 7478 3131 3230 5C74"
  $"7831 3638 305C 7478 3232 3430 5C74 7832"
  $"3830 305C 7478 3333 3630 5C74 7833 3932"
  $"305C 7478 3434 3830 5C74 7835 3034 305C"
  $"7478 3536 3030 5C74 7836 3136 305C 7478"
  $"3637 3230 5C70 6172 6469 726E 6174 7572"
  $"616C 5C70 6172 7469 6768 7465 6E66 6163"
  $"746F 7230 0A0A 5C66 305C 6673 3234 205C"
${serializeString("63663020" + Buffer.from(getRtfUnicodeEscapedString(text)).toString("hex").toUpperCase() + "7D")}`
  // ^ to produce correctly splitted output, this two leading chunks from default wrapper appended here
}

function getRegionCode(langWithRegion: string) {
  const result = regionCodes[langWithRegion]
  if (result == null) {
    throw new Error(`Cannot determine region code for ${langWithRegion}`)
  }
  return result
}

// noinspection SpellCheckingInspection
const regionCodes: any = {
  en_US: 0,
  fr_FR: 1,
  en_GB: 2,
  de_DE: 3,
  it_IT: 4,
  nl_NL: 5,
  nl_BE: 6,
  sv_SE: 7,
  es_ES: 8,
  da_DK: 9,
  pt_PT: 10,
  fr_CA: 11,
  nb_NO: 12,
  he_IL: 13,
  ja_JP: 14,
  en_AU: 15,
  ar: 16,
  fi_FI: 17,
  fr_CH: 18,
  de_CH: 19,
  el_GR: 20,
  is_IS: 21,
  mt_MT: 22,
  el_CY: 23,
  tr_TR: 24,
  hi_IN: 33,
  ur_PK: 34,
  it_CH: 36,
  ro_RO: 39,
  grc: 40,
  lt_LT: 41,
  pl_PL: 42,
  hu_HU: 43,
  et_EE: 44,
  lv_LV: 45,
  se: 46,
  fo_FO: 47,
  fa_IR: 48,
  ru_RU: 49,
  ga_IE: 50,
  ko_KR: 51,
  zh_CN: 52,
  zh_TW: 53,
  th_TH: 54,
  cs_CZ: 56,
  sk_SK: 57,
  bn: 60,
  be_BY: 61,
  uk_UA: 62,
  sr_RS: 65,
  sl_SI: 66,
  mk_MK: 67,
  hr_HR: 68,
  pt_BR: 71,
  bg_BG: 72,
  ca_ES: 73,
  gd: 75,
  gv: 76,
  br: 77,
  iu_CA: 78,
  cy: 79,
  "ga-Latg_IE": 81,
  en_CA: 82,
  dz_BT: 83,
  hy_AM: 84,
  ka_GE: 85,
  es_419: 86,
  to_TO: 88,
  fr_001: 91,
  de_AT: 92,
  gu_IN: 94,
  pa: 95,
  ur_IN: 96,
  vi_VN: 97,
  fr_BE: 98,
  uz_UZ: 99,
  en_SG: 100,
  nn_NO: 101,
  af_ZA: 102,
  eo: 103,
  mr_IN: 104,
  bo: 105,
  ne_NP: 106,
  kl: 107,
  en_IE: 108
}
