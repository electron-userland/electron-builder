import BluebirdPromise from "bluebird-lst"
import { asArray, getPlatformIconFileName, InvalidConfigurationError, log } from "builder-util"
import { copyOrLinkFile, unlinkIfExists } from "builder-util/out/fs"
import { rename, utimes } from "fs-extra"
import * as path from "path"
import { filterCFBundleIdentifier } from "../appInfo"
import { AsarIntegrity } from "../asar/integrity"
import MacPackager from "../macPackager"
import { normalizeExt } from "../platformPackager"
import { executeAppBuilderAndWriteJson, executeAppBuilderAsJson } from "../util/appBuilder"

function doRename(basePath: string, oldName: string, newName: string) {
  return rename(path.join(basePath, oldName), path.join(basePath, newName))
}

function moveHelpers(helperSuffixes: Array<string>, frameworksPath: string, appName: string, prefix: string): Promise<any> {
  return BluebirdPromise.map(helperSuffixes, suffix => {
    const executableBasePath = path.join(frameworksPath, `${prefix}${suffix}.app`, "Contents", "MacOS")
    return doRename(executableBasePath, `${prefix}${suffix}`, appName + suffix)
      .then(() => doRename(frameworksPath, `${prefix}${suffix}.app`, `${appName}${suffix}.app`))
  })
}

function getAvailableHelperSuffixes(helperEHPlist: string | null, helperNPPlist: string | null, helperRendererPlist: string | null, helperPluginPlist: string | null, helperGPUPlist: string | null) {

  const result = [" Helper"]
  if (helperEHPlist != null) {
    result.push(" Helper EH")
  }
  if (helperNPPlist != null) {
    result.push(" Helper NP")
  }
  if (helperRendererPlist != null) {
    result.push(" Helper (Renderer)")
  }
  if (helperPluginPlist != null) {
    result.push(" Helper (Plugin)")
  }
  if (helperGPUPlist != null) {
    result.push(" Helper (GPU)")
  }
  return result
}

/** @internal */
export async function createMacApp(packager: MacPackager, appOutDir: string, asarIntegrity: AsarIntegrity | null, isMas: boolean) {
  const appInfo = packager.appInfo
  const appFilename = appInfo.productFilename

  const contentsPath = path.join(appOutDir, packager.info.framework.distMacOsAppName, "Contents")
  const frameworksPath = path.join(contentsPath, "Frameworks")
  const loginItemPath = path.join(contentsPath, "Library", "LoginItems")

  const appPlistFilename = path.join(contentsPath, "Info.plist")
  const helperPlistFilename = path.join(frameworksPath, "Electron Helper.app", "Contents", "Info.plist")
  const helperEHPlistFilename = path.join(frameworksPath, "Electron Helper EH.app", "Contents", "Info.plist")
  const helperNPPlistFilename = path.join(frameworksPath, "Electron Helper NP.app", "Contents", "Info.plist")
  const helperRendererPlistFilename = path.join(frameworksPath, "Electron Helper (Renderer).app", "Contents", "Info.plist")
  const helperPluginPlistFilename = path.join(frameworksPath, "Electron Helper (Plugin).app", "Contents", "Info.plist")
  const helperGPUPlistFilename = path.join(frameworksPath, "Electron Helper (GPU).app", "Contents", "Info.plist")
  const helperLoginPlistFilename = path.join(loginItemPath, "Electron Login Helper.app", "Contents", "Info.plist")

  const plistContent: Array<any> = await executeAppBuilderAsJson(["decode-plist", "-f", appPlistFilename, "-f", helperPlistFilename, "-f", helperEHPlistFilename, "-f", helperNPPlistFilename, "-f", helperRendererPlistFilename, "-f", helperPluginPlistFilename, "-f", helperGPUPlistFilename, "-f", helperLoginPlistFilename])

  if (plistContent[0] == null) {
    throw new Error("corrupted Electron dist")
  }

  const appPlist = plistContent[0]!!
  const helperPlist = plistContent[1]!!
  const helperEHPlist = plistContent[2]
  const helperNPPlist = plistContent[3]
  const helperRendererPlist = plistContent[4]
  const helperPluginPlist = plistContent[5]
  const helperGPUPlist = plistContent[6]
  const helperLoginPlist = plistContent[7]

  // if an extend-info file was supplied, copy its contents in first
  if (plistContent[8] != null) {
    Object.assign(appPlist, plistContent[8])
  }

  const buildMetadata = packager.config!!
  const oldHelperBundleId = (buildMetadata as any)["helper-bundle-id"]
  if (oldHelperBundleId != null) {
    log.warn("build.helper-bundle-id is deprecated, please set as build.mac.helperBundleId")
  }
  const helperBundleIdentifier = filterCFBundleIdentifier(packager.platformSpecificBuildOptions.helperBundleId || oldHelperBundleId || `${appInfo.macBundleIdentifier}.helper`)

  await packager.applyCommonInfo(appPlist, contentsPath)

  // required for electron-updater proxy
  if (!isMas) {
    configureLocalhostAts(appPlist)
  }

  helperPlist.CFBundleExecutable = `${appFilename} Helper`
  helperPlist.CFBundleDisplayName = `${appInfo.productName} Helper`
  helperPlist.CFBundleIdentifier = helperBundleIdentifier
  helperPlist.CFBundleVersion = appPlist.CFBundleVersion

  function configureHelper(helper: any, postfix: string) {
    helper.CFBundleExecutable = `${appFilename} Helper ${postfix}`
    helper.CFBundleDisplayName = `${appInfo.productName} Helper ${postfix}`
    helper.CFBundleIdentifier = `${helperBundleIdentifier}.${postfix.replace(/[^a-z0-9]/gim, "")}`
    helper.CFBundleVersion = appPlist.CFBundleVersion
  }

  if (helperRendererPlist != null) {
    configureHelper(helperRendererPlist, "(Renderer)")
  }
  if (helperPluginPlist != null) {
    configureHelper(helperPluginPlist, "(Plugin)")
  }
  if (helperGPUPlist != null) {
    configureHelper(helperGPUPlist, "(GPU)")
  }
  if (helperEHPlist != null) {
    configureHelper(helperEHPlist, "EH")
  }
  if (helperNPPlist != null) {
    configureHelper(helperNPPlist, "NP")
  }
  if (helperLoginPlist != null) {
    helperLoginPlist.CFBundleExecutable = `${appFilename} Login Helper`
    helperLoginPlist.CFBundleDisplayName = `${appInfo.productName} Login Helper`
    // noinspection SpellCheckingInspection
    helperLoginPlist.CFBundleIdentifier = `${appInfo.macBundleIdentifier}.loginhelper`
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

  const fileAssociations = packager.fileAssociations
  if (fileAssociations.length > 0) {
    appPlist.CFBundleDocumentTypes = await BluebirdPromise.map(fileAssociations, async fileAssociation => {
      const extensions = asArray(fileAssociation.ext).map(normalizeExt)
      const customIcon = await packager.getResource(getPlatformIconFileName(fileAssociation.icon, true), `${extensions[0]}.icns`)
      let iconFile = appPlist.CFBundleIconFile
      if (customIcon != null) {
        iconFile = path.basename(customIcon)
        await copyOrLinkFile(customIcon, path.join(path.join(contentsPath, "Resources"), iconFile))
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

  const plistDataToWrite: any = {
    [appPlistFilename]: appPlist,
    [helperPlistFilename]: helperPlist,
  }
  if (helperEHPlist != null) {
    plistDataToWrite[helperEHPlistFilename] = helperEHPlist
  }
  if (helperNPPlist != null) {
    plistDataToWrite[helperNPPlistFilename] = helperNPPlist
  }
  if (helperRendererPlist != null) {
    plistDataToWrite[helperRendererPlistFilename] = helperRendererPlist
  }
  if (helperPluginPlist != null) {
    plistDataToWrite[helperPluginPlistFilename] = helperPluginPlist
  }
  if (helperGPUPlist != null) {
    plistDataToWrite[helperGPUPlistFilename] = helperGPUPlist
  }
  if (helperLoginPlist != null) {
    plistDataToWrite[helperLoginPlistFilename] = helperLoginPlist
  }

  await Promise.all([
    executeAppBuilderAndWriteJson(["encode-plist"], plistDataToWrite),
    doRename(path.join(contentsPath, "MacOS"), "Electron", appPlist.CFBundleExecutable),
    unlinkIfExists(path.join(appOutDir, "LICENSE")),
    unlinkIfExists(path.join(appOutDir, "LICENSES.chromium.html")),
  ])

  await moveHelpers(getAvailableHelperSuffixes(helperEHPlist, helperNPPlist, helperRendererPlist, helperPluginPlist, helperGPUPlist), frameworksPath, appFilename, "Electron")

  if (helperLoginPlist != null) {
    const prefix = "Electron"
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

function configureLocalhostAts(appPlist: any) {
  // https://bencoding.com/2015/07/20/app-transport-security-and-localhost/
  let ats = appPlist.NSAppTransportSecurity
  if (ats == null) {
    ats = {}
    appPlist.NSAppTransportSecurity = ats
  }

  ats.NSAllowsLocalNetworking = true
  // https://github.com/electron-userland/electron-builder/issues/3377#issuecomment-446035814
  ats.NSAllowsArbitraryLoads = true

  let exceptionDomains = ats.NSExceptionDomains
  if (exceptionDomains == null) {
    exceptionDomains = {}
    ats.NSExceptionDomains = exceptionDomains
  }

  if (exceptionDomains.localhost == null) {
    const allowHttp = {
      NSTemporaryExceptionAllowsInsecureHTTPSLoads: false,
      NSIncludesSubdomains: false,
      NSTemporaryExceptionAllowsInsecureHTTPLoads: true,
      NSTemporaryExceptionMinimumTLSVersion: "1.0",
      NSTemporaryExceptionRequiresForwardSecrecy: false
    }
    exceptionDomains.localhost = allowHttp
    exceptionDomains["127.0.0.1"] = allowHttp
  }
}