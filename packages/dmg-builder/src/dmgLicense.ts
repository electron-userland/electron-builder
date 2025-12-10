import { PlatformPackager } from "app-builder-lib"
<<<<<<< HEAD
import { getLicenseFiles } from "app-builder-lib/internal"
import { InvalidConfigurationError } from "builder-util"
=======
import { getLicenseFiles } from "app-builder-lib/out/util/license"
import { log } from "builder-util"
import { dmgLicenseFromJSON } from "dmg-license"
import { readFile, readJson } from "fs-extra"
import { load } from "js-yaml"
<<<<<<< HEAD
import { getLicenseButtonsFile } from "./licenseButtons.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)
=======
import { getLicenseButtonsFile } from "./licenseButtons.js"
>>>>>>> c92b22265 (tmp save for .js extension migration)

import { CORE_SCHEMA, load } from "js-yaml"
import { getLicenseButtonsFile } from "./licenseButtons.js"
import _fsExtra from "fs-extra"
const { readFile, readJson } = _fsExtra

export type DmgBuildLicenseConfig = {
  "default-language": string
  licenses: Record<string, string>
  buttons?: Record<
    string,
    {
      language?: string
      agree?: string
      disagree?: string
      print?: string
      save?: string
      message?: string
    }
  >
}

export async function addLicenseToDmg(packager: PlatformPackager<any>, explicitLicense?: string | Record<string, string> | null): Promise<DmgBuildLicenseConfig | null> {
  // null = explicitly disabled; skip both explicit and convention paths
  if (explicitLicense === null) {
    return null
  }

  // Explicit config overrides file-naming convention
  if (explicitLicense !== undefined) {
    return buildExplicitLicenseConfig(packager, explicitLicense)
  }

  // File-naming convention: license_LANG.{rtf,txt,html}
  return buildConventionLicenseConfig(packager)
}

async function buildExplicitLicenseConfig(packager: PlatformPackager<any>, license: string | Record<string, string>): Promise<DmgBuildLicenseConfig | null> {
  if (typeof license === "string") {
    const resolvedPath = await packager.getResource(license)
    if (resolvedPath == null) {
      throw new InvalidConfigurationError(`dmg.license file not found: "${license}"`)
    }
    return { "default-language": "en_US", licenses: { en_US: resolvedPath } }
  }

  // Record<langCode, filePath>
  const licenses: Record<string, string> = {}
  for (const [lang, filePath] of Object.entries(license)) {
    const resolvedPath = await packager.getResource(filePath)
    if (resolvedPath == null) {
      throw new InvalidConfigurationError(`dmg.license file not found for language "${lang}": "${filePath}"`)
    }
    licenses[lang] = resolvedPath
  }

  if (Object.keys(licenses).length === 0) {
    return null
  }

  return {
    "default-language": Object.keys(licenses)[0],
    licenses,
  }
}

async function buildConventionLicenseConfig(packager: PlatformPackager<any>): Promise<DmgBuildLicenseConfig | null> {
  const licenseFiles = await getLicenseFiles(packager)
  if (licenseFiles.length === 0) {
    return null
  }

  const licenseButtonFiles = await getLicenseButtonsFile(packager)
  packager.debugLogger.add("dmg.licenseFiles", licenseFiles)
  packager.debugLogger.add("dmg.licenseButtons", licenseButtonFiles)

  const licenses: Record<string, string> = {}
  for (const file of licenseFiles) {
    if (licenses[file.langWithRegion] != null) {
      throw new InvalidConfigurationError(
        `Multiple license files found for language "${file.langWithRegion}": "${licenses[file.langWithRegion]}" and "${file.file}". Only one license file per language is supported.`
      )
    }
    licenses[file.langWithRegion] = file.file
  }

  const result: DmgBuildLicenseConfig = {
    "default-language": licenseFiles[0].langWithRegion,
    licenses,
  }

  if (licenseButtonFiles.length > 0) {
    const buttons: DmgBuildLicenseConfig["buttons"] = {}
    for (const button of licenseButtonFiles) {
      const filepath = button.file
      const raw: any = filepath.endsWith(".yml") ? load(await readFile(filepath, "utf-8"), { schema: CORE_SCHEMA }) : await readJson(filepath)

      const entry: Record<string, string> = {}
      if (raw.languageName != null) {
        entry.language = raw.languageName
      }
      if (raw.agree != null) {
        entry.agree = raw.agree
      }
      if (raw.disagree != null) {
        entry.disagree = raw.disagree
      }
      if (raw.print != null) {
        entry.print = raw.print
      }
      if (raw.save != null) {
        entry.save = raw.save
      }
      // support legacy `description` field as well as `message`
      const msg = raw.message ?? raw.description
      if (msg != null) {
        entry.message = msg
      }

      buttons[button.langWithRegion] = entry
    }
    result.buttons = buttons
  }

  return result
}
