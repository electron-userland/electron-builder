import { ElectronPackagerOptions } from "./dirPackager"
import { rename, readFile, writeFile, copy, unlink } from "fs-extra-p"
import * as path from "path"
import { parse as parsePlist, build as buildPlist } from "plist"
import { Promise as BluebirdPromise } from "bluebird"
import { use, asArray } from "../util/util"
import { normalizeExt } from "../platformPackager"
import { FileAssociation } from "../metadata"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter")

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

export async function createApp(opts: ElectronPackagerOptions, appOutDir: string, initializeApp: () => Promise<any>) {
  const appInfo = opts.appInfo
  const appFilename = appInfo.productFilename

  const contentsPath = path.join(appOutDir, "Electron.app", "Contents")
  const frameworksPath = path.join(contentsPath, "Frameworks")

  const appPlistFilename = path.join(contentsPath, "Info.plist")
  const helperPlistFilename = path.join(frameworksPath, "Electron Helper.app", "Contents", "Info.plist")
  const helperEHPlistFilename = path.join(frameworksPath, "Electron Helper EH.app", "Contents", "Info.plist")
  const helperNPPlistFilename = path.join(frameworksPath, "Electron Helper NP.app", "Contents", "Info.plist")

  const result = await BluebirdPromise.all<any | n>([
    initializeApp(),
    BluebirdPromise.map<any | null>([appPlistFilename, helperPlistFilename, helperEHPlistFilename, helperNPPlistFilename, opts["extend-info"]], it => it == null ? it : readFile(it, "utf8"))
  ])
  const fileContents: Array<string> = result[1]!
  const appPlist = parsePlist(fileContents[0])
  const helperPlist = parsePlist(fileContents[1])
  const helperEHPlist = parsePlist(fileContents[2])
  const helperNPPlist = parsePlist(fileContents[3])

  // If an extend-info file was supplied, copy its contents in first
  if (fileContents[4] != null) {
    Object.assign(appPlist, parsePlist(fileContents[4]))
  }

  const appBundleIdentifier = filterCFBundleIdentifier(appInfo.id)
  const helperBundleIdentifier = filterCFBundleIdentifier(opts["helper-bundle-id"] || `${appBundleIdentifier}.helper`)

  const packager = opts.platformPackager
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

  use(appInfo.version, it => {
    appPlist.CFBundleShortVersionString = it
    appPlist.CFBundleVersion = it
  })
  use(appInfo.buildVersion, it => appPlist.CFBundleVersion = it)

  const protocols = asArray(packager.devMetadata.build.protocols).concat(asArray(packager.platformSpecificBuildOptions.protocols))
  if (protocols.length > 0) {
    appPlist.CFBundleURLTypes = protocols.map(protocol => {
      return {
        CFBundleURLName: protocol.name,
        CFBundleURLSchemes: protocol.schemes.slice()
      }
    })
  }

  const fileAssociations = packager.getFileAssociations()
  if (fileAssociations.length > 0) {
    appPlist.CFBundleDocumentTypes = await BluebirdPromise.map<FileAssociation>(fileAssociations, async fileAssociation => {
      const extensions = asArray(fileAssociation.ext).map(normalizeExt)
      const customIcon = await packager.getResource(fileAssociation.icon, `${extensions[0]}.icns`)
      // todo rename electron.icns
      return <any>{
        CFBundleTypeExtensions: extensions,
        CFBundleTypeName: fileAssociation.name,
        CFBundleTypeRole: fileAssociation.role || "Editor",
        CFBundleTypeIconFile: customIcon || appPlist.CFBundleIconFile
      }
    })
  }

  use(appInfo.category, it => appPlist.LSApplicationCategoryType = it)
  use(appInfo.copyright, it => appPlist.NSHumanReadableCopyright = it)

  const promises: Array<BluebirdPromise<any | n>> = [
    writeFile(appPlistFilename, buildPlist(appPlist)),
    writeFile(helperPlistFilename, buildPlist(helperPlist)),
    writeFile(helperEHPlistFilename, buildPlist(helperEHPlist)),
    writeFile(helperNPPlistFilename, buildPlist(helperNPPlist)),
    doRename(path.join(contentsPath, "MacOS"), "Electron", appPlist.CFBundleExecutable)
  ]

  if (icon != null) {
    promises.push(unlink(path.join(contentsPath, "Resources", oldIcon)))
    promises.push(copy(icon, path.join(contentsPath, "Resources", appPlist.CFBundleIconFile)))
  }

  await BluebirdPromise.all(promises)

  await moveHelpers(frameworksPath, appFilename)
  await rename(path.dirname(contentsPath), path.join(appOutDir, `${appFilename}.app`))
}