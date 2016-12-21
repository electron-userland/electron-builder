import { rename, readFile, writeFile, unlink, utimes, copy } from "fs-extra-p"
import * as path from "path"
import { parse as parsePlist, build as buildPlist } from "plist"
import BluebirdPromise from "bluebird-lst-c"
import { use, asArray } from "../util/util"
import { normalizeExt, PlatformPackager } from "../platformPackager"
import { warn } from "../util/log"
import { unlinkIfExists, copyFile } from "../util/fs"

function doRename (basePath: string, oldName: string, newName: string) {
  return rename(path.join(basePath, oldName), path.join(basePath, newName))
}

function moveHelpers (frameworksPath: string, appName: string) {
  return BluebirdPromise.map([" Helper", " Helper EH", " Helper NP"], suffix => {
    const executableBasePath = path.join(frameworksPath, `Electron${suffix}.app`, "Contents", "MacOS")
    return doRename(executableBasePath, `Electron${suffix}`, appName + suffix)
      .then(() => doRename(frameworksPath, `Electron${suffix}.app`, `${appName}${suffix}.app`))
  })
}

function filterCFBundleIdentifier(identifier: string) {
  // Remove special characters and allow only alphanumeric (A-Z,a-z,0-9), hyphen (-), and period (.)
  // Apple documentation: https://developer.apple.com/library/mac/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070
  return identifier.replace(/ /g, "-").replace(/[^a-zA-Z0-9.-]/g, "")
}

export async function createApp(packager: PlatformPackager<any>, appOutDir: string) {
  const appInfo = packager.appInfo
  const appFilename = appInfo.productFilename

  const contentsPath = path.join(appOutDir, "Electron.app", "Contents")
  const frameworksPath = path.join(contentsPath, "Frameworks")

  const appPlistFilename = path.join(contentsPath, "Info.plist")
  const helperPlistFilename = path.join(frameworksPath, "Electron Helper.app", "Contents", "Info.plist")
  const helperEHPlistFilename = path.join(frameworksPath, "Electron Helper EH.app", "Contents", "Info.plist")
  const helperNPPlistFilename = path.join(frameworksPath, "Electron Helper NP.app", "Contents", "Info.plist")

  const buildMetadata = packager.config!
  const fileContents: Array<string> = await BluebirdPromise.map([appPlistFilename, helperPlistFilename, helperEHPlistFilename, helperNPPlistFilename, (<any>buildMetadata)["extend-info"]], it => it == null ? it : readFile(it, "utf8"))
  const appPlist = parsePlist(fileContents[0])
  const helperPlist = parsePlist(fileContents[1])
  const helperEHPlist = parsePlist(fileContents[2])
  const helperNPPlist = parsePlist(fileContents[3])

  // If an extend-info file was supplied, copy its contents in first
  if (fileContents[4] != null) {
    Object.assign(appPlist, parsePlist(fileContents[4]))
  }

  const appBundleIdentifier = filterCFBundleIdentifier(appInfo.id)

  const oldHelperBundleId = (<any>buildMetadata)["helper-bundle-id"]
  if (oldHelperBundleId != null) {
    warn("build.helper-bundle-id is deprecated, please set as build.mac.helperBundleId")
  }
  const helperBundleIdentifier = filterCFBundleIdentifier(packager.platformSpecificBuildOptions.helperBundleId || oldHelperBundleId || `${appBundleIdentifier}.helper`)

  const icon = await packager.getIconPath()
  const oldIcon = appPlist.CFBundleIconFile
  if (icon != null) {
    appPlist.CFBundleIconFile = `${appInfo.productFilename}.icns`
  }

  appPlist.CFBundleDisplayName = appInfo.productName
  appPlist.CFBundleIdentifier = appBundleIdentifier
  appPlist.CFBundleName = appInfo.productName
  helperPlist.CFBundleDisplayName = `${appInfo.productName} Helper`
  helperPlist.CFBundleIdentifier = helperBundleIdentifier
  appPlist.CFBundleExecutable = appFilename
  helperPlist.CFBundleName = appInfo.productName
  helperPlist.CFBundleExecutable = `${appFilename} Helper`
  helperEHPlist.CFBundleDisplayName = `${appFilename} Helper EH`
  helperEHPlist.CFBundleIdentifier = `${helperBundleIdentifier}.EH`
  helperEHPlist.CFBundleName = `${appInfo.productName} Helper EH`
  helperEHPlist.CFBundleExecutable = `${appFilename} Helper EH`
  helperNPPlist.CFBundleDisplayName = `${appInfo.productName} Helper NP`
  helperNPPlist.CFBundleIdentifier = `${helperBundleIdentifier}.NP`
  helperNPPlist.CFBundleName = `${appInfo.productName} Helper NP`
  helperNPPlist.CFBundleExecutable = `${appFilename} Helper NP`

  appPlist.CFBundleShortVersionString = appInfo.version
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

  const fileAssociations = packager.getFileAssociations()
  if (fileAssociations.length > 0) {
    appPlist.CFBundleDocumentTypes = await BluebirdPromise.map(fileAssociations, async fileAssociation => {
      const extensions = asArray(fileAssociation.ext).map(normalizeExt)
      const customIcon = await packager.getResource(fileAssociation.icon, `${extensions[0]}.icns`)
      let iconFile = appPlist.CFBundleIconFile
      if (customIcon != null) {
        iconFile = path.basename(customIcon)
        await copyFile(customIcon, path.join(resourcesPath, iconFile))
      }

      const result = <any>{
        CFBundleTypeExtensions: extensions,
        CFBundleTypeName: fileAssociation.name,
        CFBundleTypeRole: fileAssociation.role || "Editor",
        CFBundleTypeIconFile: iconFile
      }

      if (fileAssociation.isPackage) {
        result.LSTypeIsPackage = true
      }
      return result
    })
  }

  use(packager.platformSpecificBuildOptions.category || (<any>buildMetadata).category, it => appPlist.LSApplicationCategoryType = it)
  appPlist.NSHumanReadableCopyright = appInfo.copyright

  const promises: Array<Promise<any | n>> = [
    writeFile(appPlistFilename, buildPlist(appPlist)),
    writeFile(helperPlistFilename, buildPlist(helperPlist)),
    writeFile(helperEHPlistFilename, buildPlist(helperEHPlist)),
    writeFile(helperNPPlistFilename, buildPlist(helperNPPlist)),
    doRename(path.join(contentsPath, "MacOS"), "Electron", appPlist.CFBundleExecutable),
    unlinkIfExists(path.join(appOutDir, "LICENSE")),
    unlinkIfExists(path.join(appOutDir, "LICENSES.chromium.html")),
  ]

  if (icon != null) {
    promises.push(unlink(path.join(resourcesPath, oldIcon)))
    promises.push(copy(icon, path.join(resourcesPath, appPlist.CFBundleIconFile)))
  }

  await BluebirdPromise.all(promises)

  await moveHelpers(frameworksPath, appFilename)
  const appPath = path.join(appOutDir, `${appFilename}.app`)
  await rename(path.dirname(contentsPath), appPath)
  // https://github.com/electron-userland/electron-builder/issues/840
  const now = Date.now() / 1000
  await utimes(appPath, now, now)
}