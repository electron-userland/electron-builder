import { asArray } from "builder-util"
import { bundledLanguages, langIdToName, lcid, toLangWithRegion } from "../../util/langs"
import _debug from "debug"
import { outputFile, readFile } from "fs-extra"
import { safeLoad } from "js-yaml"
import * as path from "path"
import { PlatformPackager } from "../../platformPackager"
import { NsisOptions } from "./nsisOptions"
import { NsisScriptGenerator } from "./nsisScriptGenerator"
import { nsisTemplatesDir } from "./nsisUtil"

const debug = _debug("electron-builder:nsis")

export class LangConfigurator {
  readonly isMultiLang: boolean
  readonly langs: Array<string>

  constructor(options: NsisOptions) {
    const rawList = options.installerLanguages

    if (options.unicode === false || rawList === null || (Array.isArray(rawList) && rawList.length === 0)) {
      this.isMultiLang = false
    }
    else {
      this.isMultiLang = options.multiLanguageInstaller !== false
    }

    if (this.isMultiLang) {
      this.langs = rawList == null ? bundledLanguages.slice() : asArray(rawList)
        .map(it => toLangWithRegion(it.replace("-", "_")))
    }
    else {
      this.langs = ["en_US"]
    }
  }
}

export function createAddLangsMacro(scriptGenerator: NsisScriptGenerator, langConfigurator: LangConfigurator) {
  const result: Array<string> = []
  for (const langWithRegion of langConfigurator.langs) {
    let name: string
    if (langWithRegion === "zh_CN") {
      name = "SimpChinese"
    }
    else if (langWithRegion === "zh_TW") {
      name = "TradChinese"
    }
    else if (langWithRegion === "nb_NO") {
      name = "Norwegian"
    }
    else if (langWithRegion === "pt_BR") {
      name = "PortugueseBR"
    }
    else {
      const lang = langWithRegion.substring(0, langWithRegion.indexOf("_"))
      name = (langIdToName as any)[lang]
      if (name == null) {
        throw new Error(`Language name is unknown for ${lang}`)
      }

      if (name === "Spanish") {
        name = "SpanishInternational"
      }
    }
    result.push(`!insertmacro MUI_LANGUAGE "${name}"`)
  }

  scriptGenerator.macro("addLangs", result)
}

async function writeCustomLangFile(data: string, packager: PlatformPackager<any>) {
  const file = await packager.getTempFile("messages.nsh")
  await outputFile(file, data)
  return file
}

export async function addCustomMessageFileInclude(input: string, packager: PlatformPackager<any>, scriptGenerator: NsisScriptGenerator, langConfigurator: LangConfigurator) {
  const data = safeLoad(await readFile(path.join(nsisTemplatesDir, input), "utf-8"))
  const instructions = computeCustomMessageTranslations(data, langConfigurator).join("\n")
  debug(instructions)
  scriptGenerator.include(await writeCustomLangFile(instructions, packager))
}

function computeCustomMessageTranslations(messages: any, langConfigurator: LangConfigurator): Array<string> {
  const result: Array<string> = []
  const includedLangs = new Set(langConfigurator.langs)
  for (const messageId of Object.keys(messages)) {
    const langToTranslations = messages[messageId]
    const unspecifiedLangs = new Set(langConfigurator.langs)
    for (const lang of Object.keys(langToTranslations)) {
      const langWithRegion = toLangWithRegion(lang)

      if (!includedLangs.has(langWithRegion)) {
        continue
      }

      const value = langToTranslations[lang]
      if (value == null) {
        throw new Error(`${messageId} not specified for ${lang}`)
      }

      result.push(`LangString ${messageId} ${lcid[langWithRegion]} "${value.replace(/\n/g, "$\\r$\\n")}"`)
      unspecifiedLangs.delete(langWithRegion)
    }

    if (langConfigurator.isMultiLang) {
      const defaultTranslation = langToTranslations.en.replace(/\n/g, "$\\r$\\n")
      for (const langWithRegion of unspecifiedLangs) {
        result.push(`LangString ${messageId} ${lcid[langWithRegion]} "${defaultTranslation}"`)
      }
    }
  }
  return result
}