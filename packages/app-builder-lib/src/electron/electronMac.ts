import { asArray, copyOrLinkFile, getPlatformIconFileName, InvalidConfigurationError, log, unlinkIfExists } from "builder-util"
import { rename, rm, utimes } from "fs/promises"
import * as path from "path"
import * as fs from "fs"
import { filterCFBundleIdentifier } from "../appInfo"
import { AsarIntegrity } from "../asar/integrity"
import { MacPackager } from "../macPackager"
import { normalizeExt } from "../platformPackager"
import { savePlistFile, parsePlistFile, PlistObject, PlistValue } from "../util/plist"
import { createBrandingOpts } from "./ElectronFramework"

async function doRename(basePath: string, oldName: string, newName: string) {
  return rename(path.join(basePath, oldName), path.join(basePath, newName))
}

function moveHelpers(helperSuffixes: Array<string>, frameworksPath: string, appName: string, prefix: string): Promise<any> {
  return Promise.all(
    helperSuffixes.map(suffix => {
      const executableBasePath = path.join(frameworksPath, `${prefix}${suffix}.app`, "Contents", "MacOS")
      return doRename(executableBasePath, `${prefix}${suffix}`, appName + suffix).then(() => doRename(frameworksPath, `${prefix}${suffix}.app`, `${appName}${suffix}.app`))
    })
  )
}

function getAvailableHelperSuffixes(
  helperEHPlist: PlistObject | null,
  helperNPPlist: PlistObject | null,
  helperRendererPlist: PlistObject | null,
  helperPluginPlist: PlistObject | null,
  helperGPUPlist: PlistObject | null
) {
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
  // Electon uses the application name (CFBundleName) to resolve helper apps
  // https://github.com/electron/electron/blob/main/shell/app/electron_main_delegate_mac.mm
  // https://github.com/electron-userland/electron-builder/issues/6962
  const appFilename = appInfo.sanitizedProductName
  const electronBranding = createBrandingOpts(packager.config)

  const contentsPath = path.join(appOutDir, `${packager.info.framework.productName}.app`, "Contents")
  const frameworksPath = path.join(contentsPath, "Frameworks")
  const loginItemPath = path.join(contentsPath, "Library", "LoginItems")

  const appPlistFilename = path.join(contentsPath, "Info.plist")
  const helperPlistFilename = path.join(frameworksPath, `${electronBranding.productName} Helper.app`, "Contents", "Info.plist")
  const helperEHPlistFilename = path.join(frameworksPath, `${electronBranding.productName} Helper EH.app`, "Contents", "Info.plist")
  const helperNPPlistFilename = path.join(frameworksPath, `${electronBranding.productName} Helper NP.app`, "Contents", "Info.plist")
  const helperRendererPlistFilename = path.join(frameworksPath, `${electronBranding.productName} Helper (Renderer).app`, "Contents", "Info.plist")
  const helperPluginPlistFilename = path.join(frameworksPath, `${electronBranding.productName} Helper (Plugin).app`, "Contents", "Info.plist")
  const helperGPUPlistFilename = path.join(frameworksPath, `${electronBranding.productName} Helper (GPU).app`, "Contents", "Info.plist")
  const helperLoginPlistFilename = path.join(loginItemPath, `${electronBranding.productName} Login Helper.app`, "Contents", "Info.plist")

  const safeParsePlistFile = async (filePath: string): Promise<PlistObject | null> => {
    if (!fs.existsSync(filePath)) {
      return null
    }
    return await parsePlistFile(filePath)
  }

  const appPlist = (await safeParsePlistFile(appPlistFilename))!
  if (appPlist == null) {
    throw new Error("corrupted Electron dist")
  }

  // Replace the multiple parsePlistFile calls with:
  const helperPlist = await safeParsePlistFile(helperPlistFilename)
  const helperEHPlist = await safeParsePlistFile(helperEHPlistFilename)
  const helperNPPlist = await safeParsePlistFile(helperNPPlistFilename)
  const helperRendererPlist = await safeParsePlistFile(helperRendererPlistFilename)
  const helperPluginPlist = await safeParsePlistFile(helperPluginPlistFilename)
  const helperGPUPlist = await safeParsePlistFile(helperGPUPlistFilename)
  const helperLoginPlist = await safeParsePlistFile(helperLoginPlistFilename)

  const buildMetadata = packager.config

  /**
   * Configure bundleIdentifier for the generic Electron Helper process
   *
   * This was the only Helper in Electron 5 and before. Allow users to configure
   * the bundleIdentifier for continuity.
   */

  const oldHelperBundleId = (buildMetadata as any)["helper-bundle-id"]
  if (oldHelperBundleId != null) {
    log.warn("build.helper-bundle-id is deprecated, please set as build.mac.helperBundleId")
  }

  const defaultAppId = packager.platformSpecificBuildOptions.appId
  const cfBundleIdentifier = filterCFBundleIdentifier((isMas ? packager.config.mas?.appId : defaultAppId) || defaultAppId || appInfo.macBundleIdentifier)

  const defaultHelperId = packager.platformSpecificBuildOptions.helperBundleId
  const helperBundleIdentifier = filterCFBundleIdentifier(
    (isMas ? packager.config.mas?.helperBundleId : defaultHelperId) || defaultHelperId || oldHelperBundleId || `${cfBundleIdentifier}.helper`
  )

  appPlist.CFBundleIdentifier = cfBundleIdentifier

  await packager.applyCommonInfo(appPlist, contentsPath)

  // required for electron-updater proxy
  if (!isMas) {
    configureLocalhostAts(appPlist)
  }

  if (helperPlist != null) {
    helperPlist.CFBundleExecutable = `${appFilename} Helper`
    helperPlist.CFBundleDisplayName = `${appInfo.productName} Helper`
    helperPlist.CFBundleIdentifier = helperBundleIdentifier
    helperPlist.CFBundleVersion = appPlist.CFBundleVersion
  }

  /**
   * Configure bundleIdentifier for Electron 5+ Helper processes
   *
   * In Electron 6, parts of the generic Electron Helper process were split into
   * individual helper processes. Allow users to configure the bundleIdentifiers
   * for continuity, specifically because macOS keychain access relies on
   * bundleIdentifiers not changing (i.e. across versions of Electron).
   */

  function configureHelper(helper: any, postfix: string, userProvidedBundleIdentifier?: string | null) {
    helper.CFBundleExecutable = `${appFilename} Helper ${postfix}`
    helper.CFBundleDisplayName = `${appInfo.productName} Helper ${postfix}`
    helper.CFBundleIdentifier = userProvidedBundleIdentifier
      ? filterCFBundleIdentifier(userProvidedBundleIdentifier)
      : filterCFBundleIdentifier(`${helperBundleIdentifier}.${postfix}`)
    helper.CFBundleVersion = appPlist.CFBundleVersion
  }

  if (helperRendererPlist != null) {
    configureHelper(helperRendererPlist, "(Renderer)", packager.platformSpecificBuildOptions.helperRendererBundleId)
  }
  if (helperPluginPlist != null) {
    configureHelper(helperPluginPlist, "(Plugin)", packager.platformSpecificBuildOptions.helperPluginBundleId)
  }
  if (helperGPUPlist != null) {
    configureHelper(helperGPUPlist, "(GPU)", packager.platformSpecificBuildOptions.helperGPUBundleId)
  }
  if (helperEHPlist != null) {
    configureHelper(helperEHPlist, "EH", packager.platformSpecificBuildOptions.helperEHBundleId)
  }
  if (helperNPPlist != null) {
    configureHelper(helperNPPlist, "NP", packager.platformSpecificBuildOptions.helperNPBundleId)
  }
  if (helperLoginPlist != null) {
    helperLoginPlist.CFBundleExecutable = `${appFilename} Login Helper`
    helperLoginPlist.CFBundleDisplayName = `${appInfo.productName} Login Helper`
    // noinspection SpellCheckingInspection
    helperLoginPlist.CFBundleIdentifier = `${cfBundleIdentifier}.loginhelper`
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
        CFBundleURLSchemes: schemes.slice(),
      }
    })
  }

  const fileAssociations = packager.fileAssociations
  if (fileAssociations.length > 0) {
    const documentTypes = await Promise.all(
      fileAssociations.map(async fileAssociation => {
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
          LSHandlerRank: fileAssociation.rank || "Default",
          CFBundleTypeIconFile: iconFile,
        } as any

        if (fileAssociation.isPackage) {
          result.LSTypeIsPackage = true
        }
        return result
      })
    )

    // `CFBundleDocumentTypes` may be defined in `mac.extendInfo`, so we need to merge it in that case
    appPlist.CFBundleDocumentTypes = [...((appPlist.CFBundleDocumentTypes as PlistValue[]) || []), ...documentTypes]
  }

  const toPlistObject = (asarIntegrity: AsarIntegrity): PlistObject => {
    const result: PlistObject = {}
    for (const [filePath, headerHash] of Object.entries(asarIntegrity)) {
      result[filePath] = {
        algorithm: headerHash.algorithm,
        hash: headerHash.hash,
      }
    }
    return result
  }

  if (asarIntegrity != null) {
    appPlist.ElectronAsarIntegrity = toPlistObject(asarIntegrity)
  }

  if (helperEHPlist != null) {
    await savePlistFile(helperEHPlistFilename, helperEHPlist)
  }

  if (helperNPPlist != null) {
    await savePlistFile(helperNPPlistFilename, helperNPPlist)
  }

  if (helperRendererPlist != null) {
    await savePlistFile(helperRendererPlistFilename, helperRendererPlist)
  }

  if (helperPluginPlist != null) {
    await savePlistFile(helperPluginPlistFilename, helperPluginPlist)
  }

  if (helperGPUPlist != null) {
    await savePlistFile(helperGPUPlistFilename, helperGPUPlist)
  }

  if (helperLoginPlist != null) {
    await savePlistFile(helperLoginPlistFilename, helperLoginPlist)
  }

  await savePlistFile(appPlistFilename, appPlist)
  if (helperPlist != null) {
    await savePlistFile(helperPlistFilename, helperPlist)
  }

  await Promise.all([
    doRename(path.join(contentsPath, "MacOS"), electronBranding.productName, appPlist.CFBundleExecutable as string),
    unlinkIfExists(path.join(appOutDir, "LICENSE")),
    unlinkIfExists(path.join(appOutDir, "LICENSES.chromium.html")),
  ])

  await moveHelpers(
    getAvailableHelperSuffixes(helperEHPlist, helperNPPlist, helperRendererPlist, helperPluginPlist, helperGPUPlist),
    frameworksPath,
    appFilename,
    electronBranding.productName
  )

  if (helperLoginPlist != null) {
    const prefix = electronBranding.productName
    const suffix = " Login Helper"
    const executableBasePath = path.join(loginItemPath, `${prefix}${suffix}.app`, "Contents", "MacOS")
    await doRename(executableBasePath, `${prefix}${suffix}`, appFilename + suffix).then(() => doRename(loginItemPath, `${prefix}${suffix}.app`, `${appFilename}${suffix}.app`))
  }

  const appPath = path.join(appOutDir, `${appInfo.productFilename}.app`)
  await rm(appPath, { force: true, recursive: true })
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
      NSTemporaryExceptionRequiresForwardSecrecy: false,
    }
    exceptionDomains.localhost = allowHttp
    exceptionDomains["127.0.0.1"] = allowHttp
  }
}
