import BluebirdPromise from "bluebird-lst"
import { asArray, getPlatformIconFileName, InvalidConfigurationError, log } from "builder-util"
import { copyOrLinkFile, unlinkIfExists } from "builder-util/out/fs"
import { readFile, rename, utimes, writeFile } from "fs-extra-p"
import * as path from "path"
import { build as buildPlist, parse as parsePlist } from "plist"
import { orIfFileNotExist } from "builder-util/out/promise"
import { filterCFBundleIdentifier } from "../appInfo"
import { AsarIntegrity } from "../asar/integrity"
import MacPackager from "../macPackager"
import { normalizeExt } from "../platformPackager"

function doRename(basePath: string, oldName: string, newName: string) {
  return rename(path.join(basePath, oldName), path.join(basePath, newName))
}

function moveHelpers(frameworksPath: string, appName: string, prefix: string): Promise<any> {
  return BluebirdPromise.map([" Helper", " Helper EH", " Helper NP"], suffix => {
    const executableBasePath = path.join(frameworksPath, `${prefix}${suffix}.app`, "Contents", "MacOS")
    return doRename(executableBasePath, `${prefix}${suffix}`, appName + suffix)
      .then(() => doRename(frameworksPath, `${prefix}${suffix}.app`, `${appName}${suffix}.app`))
  })
}

/** @internal */
export async function createMacApp(packager: MacPackager, appOutDir: string, asarIntegrity: AsarIntegrity | null) {
  const appInfo = packager.appInfo
  const appFilename = appInfo.productFilename

  const contentsPath = path.join(appOutDir, packager.info.framework.distMacOsAppName, "Contents")
  const frameworksPath = path.join(contentsPath, "Frameworks")
  const loginItemPath = path.join(contentsPath, "Library", "LoginItems")

  const appPlistFilename = path.join(contentsPath, "Info.plist")
  const helperPlistFilename = path.join(frameworksPath, `${packager.electronDistMacOsExecutableName} Helper.app`, "Contents", "Info.plist")
  const helperEHPlistFilename = path.join(frameworksPath, `${packager.electronDistMacOsExecutableName} Helper EH.app`, "Contents", "Info.plist")
  const helperNPPlistFilename = path.join(frameworksPath, `${packager.electronDistMacOsExecutableName} Helper NP.app`, "Contents", "Info.plist")
  const helperLoginPlistFilename = path.join(loginItemPath, `${packager.electronDistMacOsExecutableName} Login Helper.app`, "Contents", "Info.plist")

  const buildMetadata = packager.config!
  const fileContents: Array<string | null> = await BluebirdPromise.map([
    appPlistFilename,
    helperPlistFilename,
    helperEHPlistFilename,
    helperNPPlistFilename,
    helperLoginPlistFilename,
    (buildMetadata as any)["extend-info"]
  ], it => it == null ? it : orIfFileNotExist(readFile(it, "utf8"), null))
  const appPlist = parsePlist(fileContents[0]!!)
  const helperPlist = parsePlist(fileContents[1]!!)
  const helperEHPlist = parsePlist(fileContents[2]!!)
  const helperNPPlist = parsePlist(fileContents[3]!!)
  const helperLoginPlist = fileContents[4] == null ? null : parsePlist(fileContents[4]!!)

  // if an extend-info file was supplied, copy its contents in first
  if (fileContents[5] != null) {
    Object.assign(appPlist, parsePlist(fileContents[5]!!))
  }

  const oldHelperBundleId = (buildMetadata as any)["helper-bundle-id"]
  if (oldHelperBundleId != null) {
    log.warn("build.helper-bundle-id is deprecated, please set as build.mac.helperBundleId")
  }
  const helperBundleIdentifier = filterCFBundleIdentifier(packager.platformSpecificBuildOptions.helperBundleId || oldHelperBundleId || `${appInfo.macBundleIdentifier}.helper`)

  await packager.applyCommonInfo(appPlist, contentsPath)

  helperPlist.CFBundleExecutable = `${appFilename} Helper`
  helperEHPlist.CFBundleExecutable = `${appFilename} Helper EH`
  helperNPPlist.CFBundleExecutable = `${appFilename} Helper NP`
  if (helperLoginPlist != null) {
    helperLoginPlist.CFBundleExecutable = `${appFilename} Login Helper`
  }

  helperPlist.CFBundleDisplayName = `${appInfo.productName} Helper`
  helperEHPlist.CFBundleDisplayName = `${appInfo.productName} Helper EH`
  helperNPPlist.CFBundleDisplayName = `${appInfo.productName} Helper NP`
  if (helperLoginPlist != null) {
    helperLoginPlist.CFBundleDisplayName = `${appInfo.productName} Login Helper`
  }

  helperPlist.CFBundleIdentifier = helperBundleIdentifier
  helperEHPlist.CFBundleIdentifier = `${helperBundleIdentifier}.EH`
  helperNPPlist.CFBundleIdentifier = `${helperBundleIdentifier}.NP`
  if (helperLoginPlist != null) {
    // noinspection SpellCheckingInspection
    helperLoginPlist.CFBundleIdentifier = `${appInfo.macBundleIdentifier}.loginhelper`
  }

  helperPlist.CFBundleVersion = appPlist.CFBundleVersion
  helperEHPlist.CFBundleVersion = appPlist.CFBundleVersion
  helperNPPlist.CFBundleVersion = appPlist.CFBundleVersion
  if (helperLoginPlist != null) {
    helperLoginPlist.CFBundleVersion = appPlist.CFBundleVersion
  }

  const protocols = asArray(buildMetadata.protocols).concat(asArray(packager.platformSpecificBuildOptions.protocols))
  if (protocols.length > 0) {
    appPlist.CFBundleURLTypes = protocols.map(protocol => {
      const schemes = asArray(protocol.schemes)
      if (schemes.length === 0) {
        throw new InvalidConfigurationError(`Protocol "${protocol.name}": must be at least one scheme specified`)
      }
      return {
        CFBundleURLName: protocol.name,
        CFBundleTypeRole: protocol.role || "Editor",
        CFBundleURLSchemes: schemes.slice()
      }
    })
  }

  const resourcesPath = path.join(contentsPath, "Resources")

  const fileAssociations = packager.fileAssociations
  if (fileAssociations.length > 0) {
    appPlist.CFBundleDocumentTypes = await BluebirdPromise.map(fileAssociations, async fileAssociation => {
      const extensions = asArray(fileAssociation.ext).map(normalizeExt)
      const customIcon = await packager.getResource(getPlatformIconFileName(fileAssociation.icon, true), `${extensions[0]}.icns`)
      let iconFile = appPlist.CFBundleIconFile
      if (customIcon != null) {
        iconFile = path.basename(customIcon)
        await copyOrLinkFile(customIcon, path.join(resourcesPath, iconFile))
      }

      const result = {
        CFBundleTypeExtensions: extensions,
        CFBundleTypeName: fileAssociation.name || extensions[0],
        CFBundleTypeRole: fileAssociation.role || "Editor",
        CFBundleTypeIconFile: iconFile
      } as any

      if (fileAssociation.isPackage) {
        result.LSTypeIsPackage = true
      }
      return result
    })
  }

  if (asarIntegrity != null) {
    appPlist.AsarIntegrity = JSON.stringify(asarIntegrity)
  }

  await Promise.all([
    writeFile(appPlistFilename, buildPlist(appPlist)),
    writeFile(helperPlistFilename, buildPlist(helperPlist)),
    writeFile(helperEHPlistFilename, buildPlist(helperEHPlist)),
    writeFile(helperNPPlistFilename, buildPlist(helperNPPlist)),
    helperLoginPlist == null ? Promise.resolve() : writeFile(helperLoginPlistFilename, buildPlist(helperLoginPlist)),
    doRename(path.join(contentsPath, "MacOS"), packager.electronDistMacOsExecutableName, appPlist.CFBundleExecutable),
    unlinkIfExists(path.join(appOutDir, "LICENSE")),
    unlinkIfExists(path.join(appOutDir, "LICENSES.chromium.html")),
  ])

  await moveHelpers(frameworksPath, appFilename, packager.electronDistMacOsExecutableName)

  if (helperLoginPlist != null) {
    const prefix = packager.electronDistMacOsExecutableName
    const suffix = " Login Helper"
    const executableBasePath = path.join(loginItemPath, `${prefix}${suffix}.app`, "Contents", "MacOS")
    await doRename(executableBasePath, `${prefix}${suffix}`, appFilename + suffix)
      .then(() => doRename(loginItemPath, `${prefix}${suffix}.app`, `${appFilename}${suffix}.app`))
  }
  const appPath = path.join(appOutDir, `${appFilename}.app`)
  await rename(path.dirname(contentsPath), appPath)
  // https://github.com/electron-userland/electron-builder/issues/840
  const now = Date.now() / 1000
  await utimes(appPath, now, now)
}