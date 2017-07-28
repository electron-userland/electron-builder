import BluebirdPromise from "bluebird-lst"
import _debug from "debug"
import { subTask } from "electron-builder-util"
import { outputFile, readFile, unlink } from "fs-extra-p"
import { safeLoad } from "js-yaml"
import * as path from "path"
import { Arch } from "../../core"
import { PlatformPackager } from "../../platformPackager"
import { bundledLanguages, lcid, toLangWithRegion } from "../license"
import { NsisTarget } from "../nsis"

export const nsisTemplatesDir = path.join(__dirname, "..", "..", "..", "templates", "nsis")

interface PackageFileInfo {
  file: string
}

const debug = _debug("electron-builder:nsis")

export function createMacro(name: string, lines: Array<string>) {
  return `\n!macro ${name}\n  ${lines.join("\n  ")}\n!macroend\n`
}

export class AppPackageHelper {
  private readonly archToFileInfo = new Map<Arch, Promise<PackageFileInfo>>()
  private readonly infoToIsDelete = new Map<PackageFileInfo, boolean>()

  /** @private */
  refCount = 0

  async packArch(arch: Arch, target: NsisTarget) {
    let infoPromise = this.archToFileInfo.get(arch)
    if (infoPromise == null) {
      infoPromise = subTask(`Packaging NSIS installer for arch ${Arch[arch]}`, target.buildAppPackage(target.archs.get(arch)!, arch))
        .then(it => ({file: it}))
      this.archToFileInfo.set(arch, infoPromise)
    }

    const info = await infoPromise
    if (target.isWebInstaller) {
      this.infoToIsDelete.set(info, false)
    }
    else if (!this.infoToIsDelete.has(info)) {
      this.infoToIsDelete.set(info, true)
    }
    return info.file
  }

  async finishBuild(): Promise<any> {
    if (--this.refCount > 0) {
      return
    }

    const filesToDelete: Array<string> = []
    for (const [info, isDelete]  of this.infoToIsDelete.entries()) {
      if (isDelete) {
        filesToDelete.push(info.file)
      }
    }

    await BluebirdPromise.map(filesToDelete, it => unlink(it))
  }
}

async function writeCustomLangFile(data: string, packager: PlatformPackager<any>) {
  const file = await packager.getTempFile("messages.nsh")
  await outputFile(file, data)
  return file
}

export async function addCustomMessageFileInclude(input: string, packager: PlatformPackager<any>, isMultiLang: boolean) {
  const data = safeLoad(await readFile(path.join(nsisTemplatesDir, input), "utf-8"))
  if (!isMultiLang) {
    for (const messageId of Object.keys(data)) {
      for (const langId of Object.keys(data[messageId])) {
        if (langId !== "en") {
          delete data[messageId][langId]
        }
      }
    }
  }

  const instructions = computeCustomMessageTranslations(data, isMultiLang).join("\n")
  debug(instructions)
  return '!include "' + await writeCustomLangFile(instructions, packager) + '"\n'
}

function computeCustomMessageTranslations(messages: any, isUnicodeEnabled: boolean): Array<string> {
  const result: Array<string> = []
  for (const messageId of Object.keys(messages)) {
    const langToTranslations = messages[messageId]
    const unspecifiedLangs = new Set(bundledLanguages)
    for (const lang of Object.keys(langToTranslations)) {
      const langWithRegion = toLangWithRegion(lang)
      result.push(`LangString ${messageId} ${lcid[langWithRegion]} "${langToTranslations[lang].replace(/\n/g, "$\\r$\\n")}"`)
      unspecifiedLangs.delete(langWithRegion)
    }

    if (isUnicodeEnabled) {
      const defaultTranslation = langToTranslations.en.replace(/\n/g, "$\\r$\\n")
      for (const langWithRegion of unspecifiedLangs) {
        result.push(`LangString ${messageId} ${lcid[langWithRegion]} "${defaultTranslation}"`)
      }
    }
  }
  return result
}