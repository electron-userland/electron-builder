import { debug, exec } from "builder-util"
import { PackageBuilder } from "builder-util/out/api"
import { getLicenseFiles } from "builder-util/out/license"
import { outputFile, readFile } from "fs-extra-p"
import { getDmgVendorPath } from "./dmgUtil"

export async function addLicenseToDmg(packager: PackageBuilder, dmgPath: string) {
  const licenseFiles = await getLicenseFiles(packager)
  if (licenseFiles.length === 0) {
    return
  }

  if (debug.enabled) {
    debug(`License files: ${licenseFiles.join(" ")}`)
  }

  let licenses = ""
  const iconv = require("iconv-lite")
  const indent = "    "
  for (const item of licenseFiles) {
    const encoding = getEncoderName(item.langWithRegion)
    if (!iconv.encodingExists(encoding)) {
      throw new Error(`${encoding} is not supported by iconv-lite`)
    }

    const fileData = await readFile(item.file, "utf-8")
    const data = iconv.encode(fileData, encoding)
    const isRtf = item.file.endsWith(".rtf") || item.file.endsWith(".RTF")
    licenses += [
      `${indent}'${item.langWithRegion}': {`,
      `${indent}  'data': bytearray.fromhex('${data.toString("hex")}'),`,
      `${indent}  'isRtf': ${isRtf ? "True" : "False"}`,
      `${indent}}`,
    ].join("\n") + ",\n"
  }

  const script = [
    "# -*- coding: utf-8 -*-",
    "from __future__ import unicode_literals",
    "import dmgbuild.licensing",
    "license = {",
    "  'default-language': 'en_US',",
    "  'licenses': {",
    licenses,
    "  }",
    "}",
    `dmgbuild.licensing.add_license('${dmgPath}', license)`
  ]

  const tempFile = await packager.getTempFile(".py")
  await outputFile(tempFile, script.join("\n"))

  if (debug.enabled) {
    debug(`License: ${script.join("\n")}`)
  }

  await exec("hdiutil", ["unflatten", "-quiet", dmgPath])

  await exec("/usr/bin/python", [tempFile], {
    env: {
      ...process.env,
      PYTHONPATH: getDmgVendorPath(),
      LC_CTYPE: "en_US.UTF-8",
      LANG: "en_US.UTF-8",
    }
  })

  await exec("hdiutil", ["flatten", "-quiet", dmgPath])
}

function getEncoderName(langWithRegion: string): string {
  const regionCode = regionCodes[langWithRegion]
  if (regionCode == null) {
    throw new Error(`Cannot determine region code for ${langWithRegion}`)
  }

  const scriptCode = scriptCodes[regionCode]
  if (regionCode == null) {
    throw new Error(`Cannot determine script code for ${langWithRegion}`)
  }

  const encodingName = encodingsMap[scriptCode]
  if (regionCode == null) {
    throw new Error(`Cannot mac determine encoding for ${langWithRegion}`)
  }
  return encodingName
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

const scriptCodes: any = {
  0: 0,
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
  6: 0,
  7: 0,
  8: 0,
  9: 0,
  10: 0,
  11: 0,
  12: 0,
  13: 5,
  14: 1,
  15: 0,
  16: 4,
  17: 0,
  18: 0,
  19: 0,
  20: 6,
  21: 37,
  22: 0,
  23: 6,
  24: 35,
  25: 36,
  26: 0,
  27: 0,
  30: 0,
  31: 0,
  32: 0,
  33: 9,
  34: 4,
  35: 35,
  36: 0,
  37: 0,
  39: 38,
  40: 6,
  41: 29,
  42: 29,
  43: 29,
  44: 29,
  45: 29,
  46: 0,
  47: 37,
  48: 140,
  49: 7,
  50: 39,
  51: 3,
  52: 25,
  53: 2,
  54: 21,
  56: 29,
  57: 29,
  59: 29,
  60: 13,
  61: 7,
  62: 7,
  64: 6,
  65: 7,
  66: 36,
  67: 7,
  68: 36,
  70: 0,
  71: 0,
  72: 7,
  73: 0,
  75: 39,
  76: 39,
  77: 39,
  78: 236,
  79: 39,
  81: 40,
  82: 0,
  83: 26,
  84: 24,
  85: 23,
  86: 0,
  88: 0,
  91: 0,
  92: 0,
  94: 11,
  95: 10,
  96: 4,
  97: 30,
  98: 0,
  99: 7,
  100: 0,
  101: 0,
  102: 0,
  103: 0,
  104: 9,
  105: 26,
  106: 9,
  107: 0,
  108: 0
}

// https://github.com/ashtuchkin/iconv-lite/wiki/Supported-Encodings
// noinspection SpellCheckingInspection
const encodingsMap: any = {
  0: "macroman",
  1: "Shift_JIS",
  2: "Big5",
  3: "EUC-KR",
  4: "mac_arabic",
  6: "macgreek",
  7: "maccyrillic",
  21: "ISO-8859-1",
  25: "EUC-CN",
  29: "maccenteuro",
  35: "macturkish",
  36: "maccroatian",
  37: "maciceland",
  38: "macromania",
  140: "macfarsi"
}