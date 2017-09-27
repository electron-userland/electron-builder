import { AsarIntegrity } from "asar-integrity"
import BluebirdPromise from "bluebird-lst"
import { asArray, getPlatformIconFileName, use, warn } from "builder-util"
import { copyFile, copyOrLinkFile, unlinkIfExists } from "builder-util/out/fs"
import { readFile, rename, utimes, writeFile } from "fs-extra-p"
import * as path from "path"
import { build as buildPlist, parse as parsePlist } from "plist"
import { normalizeExt, PlatformPackager } from "../platformPackager"

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
export function filterCFBundleIdentifier(identifier: string) {
  // Remove special characters and allow only alphanumeric (A-Z,a-z,0-9), hyphen (-), and period (.)
  // Apple documentation: https://developer.apple.com/library/mac/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070
  return identifier.replace(/ /g, "-").replace(/[^a-zA-Z0-9.-]/g, "")
}

/** @internal */
export async function createMacApp(packager: PlatformPackager<any>, appOutDir: string, asarIntegrity: AsarIntegrity | null) {
  const appInfo = packager.appInfo
  const appFilename = appInfo.productFilename

  const contentsPath = path.join(appOutDir, packager.electronDistMacOsAppName, "Contents")
  const frameworksPath = path.join(contentsPath, "Frameworks")

  const appPlistFilename = path.join(contentsPath, "Info.plist")
  const helperPlistFilename = path.join(frameworksPath, `${packager.electronDistMacOsExecutableName} Helper.app`, "Contents", "Info.plist")
  const helperEHPlistFilename = path.join(frameworksPath, `${packager.electronDistMacOsExecutableName} Helper EH.app`, "Contents", "Info.plist")
  const helperNPPlistFilename = path.join(frameworksPath, `${packager.electronDistMacOsExecutableName} Helper NP.app`, "Contents", "Info.plist")

  const buildMetadata = packager.config!
  const fileContents: Array<string> = await BluebirdPromise.map([appPlistFilename, helperPlistFilename, helperEHPlistFilename, helperNPPlistFilename, (buildMetadata as any)["extend-info"]], it => it == null ? it : readFile(it, "utf8"))
  const appPlist = parsePlist(fileContents[0])
  const helperPlist = parsePlist(fileContents[1])
  const helperEHPlist = parsePlist(fileContents[2])
  const helperNPPlist = parsePlist(fileContents[3])

  // If an extend-info file was supplied, copy its contents in first
  if (fileContents[4] != null) {
    Object.assign(appPlist, parsePlist(fileContents[4]))
  }

  const macOptions = buildMetadata.mac || {}
  if (macOptions.extendInfo != null) {
    Object.assign(appPlist, macOptions.extendInfo)
  }

  const appBundleIdentifier = filterCFBundleIdentifier(appInfo.id)

  const oldHelperBundleId = (buildMetadata as any)["helper-bundle-id"]
  if (oldHelperBundleId != null) {
    warn("build.helper-bundle-id is deprecated, please set as build.mac.helperBundleId")
  }
  const helperBundleIdentifier = filterCFBundleIdentifier(packager.platformSpecificBuildOptions.helperBundleId || oldHelperBundleId || `${appBundleIdentifier}.helper`)

  const icon = await packager.getIconPath()
  const oldIcon = appPlist.CFBundleIconFile
  if (icon != null) {
    appPlist.CFBundleIconFile = `${appFilename}.icns`
  }

  appPlist.CFBundleDisplayName = appInfo.productName
  appPlist.CFBundleIdentifier = appBundleIdentifier
  appPlist.CFBundleName = appInfo.productName

  // https://github.com/electron-userland/electron-builder/issues/1278
  appPlist.CFBundleExecutable = !appFilename.endsWith(" Helper") ? appFilename : appFilename.substring(0, appFilename.length - " Helper".length)

  helperPlist.CFBundleExecutable = `${appFilename} Helper`
  helperEHPlist.CFBundleExecutable = `${appFilename} Helper EH`
  helperNPPlist.CFBundleExecutable = `${appFilename} Helper NP`

  helperPlist.CFBundleDisplayName = `${appInfo.productName} Helper`
  helperEHPlist.CFBundleDisplayName = `${appInfo.productName} Helper EH`
  helperNPPlist.CFBundleDisplayName = `${appInfo.productName} Helper NP`

  helperPlist.CFBundleIdentifier = helperBundleIdentifier
  helperEHPlist.CFBundleIdentifier = `${helperBundleIdentifier}.EH`
  helperNPPlist.CFBundleIdentifier = `${helperBundleIdentifier}.NP`

  appPlist.CFBundleShortVersionString = macOptions.bundleShortVersion || appInfo.version
  appPlist.CFBundleVersion = appInfo.buildVersion

  const protocols = asArray(buildMetadata.protocols).concat(asArray(packager.platformSpecificBuildOptions.protocols))
  if (protocols.length > 0) {
    appPlist.CFBundleURLTypes = protocols.map(protocol => {
      const schemes = asArray(protocol.schemes)
      if (schemes.length === 0) {
        throw new Error(`Protocol "${protocol.name}": must be at least one scheme specified`)
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

  use(packager.platformSpecificBuildOptions.category || (buildMetadata as any).category, it => appPlist.LSApplicationCategoryType = it)
  appPlist.NSHumanReadableCopyright = appInfo.copyright

  if (asarIntegrity != null) {
    appPlist.AsarIntegrity = JSON.stringify(asarIntegrity)
  }

  const promises: Array<Promise<any | null | undefined>> = [
    writeFile(appPlistFilename, buildPlist(appPlist)),
    writeFile(helperPlistFilename, buildPlist(helperPlist)),
    writeFile(helperEHPlistFilename, buildPlist(helperEHPlist)),
    writeFile(helperNPPlistFilename, buildPlist(helperNPPlist)),
    doRename(path.join(contentsPath, "MacOS"), packager.electronDistMacOsExecutableName, appPlist.CFBundleExecutable),
    unlinkIfExists(path.join(appOutDir, "LICENSE")),
    unlinkIfExists(path.join(appOutDir, "LICENSES.chromium.html")),
  ]

  if (icon != null) {
    promises.push(unlinkIfExists(path.join(resourcesPath, oldIcon)))
    promises.push(copyFile(icon, path.join(resourcesPath, appPlist.CFBundleIconFile)))
  }

  await BluebirdPromise.all(promises)

  await moveHelpers(frameworksPath, appFilename, packager.electronDistMacOsExecutableName)
  const appPath = path.join(appOutDir, `${appFilename}.app`)
  await rename(path.dirname(contentsPath), appPath)
  // https://github.com/electron-userland/electron-builder/issues/840
  const now = Date.now() / 1000
  await utimes(appPath, now, now)
}