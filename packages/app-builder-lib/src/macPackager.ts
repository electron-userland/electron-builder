import { notarize } from "@electron/notarize"
import { NotarizeOptionsNotaryTool, NotaryToolKeychainCredentials } from "@electron/notarize/lib/types"
import { PerFileSignOptions, SignOptions } from "@electron/osx-sign/dist/cjs/types"
import { Identity } from "@electron/osx-sign/dist/cjs/util-identities"
import {
  Arch,
  AsyncTaskManager,
  copyFile,
  deepAssign,
  exec,
  exists,
  getArchSuffix,
  InvalidConfigurationError,
  log,
  orIfFileNotExist,
  statOrNull,
  unlinkIfExists,
  use,
} from "builder-util"
import { MemoLazy, Nullish } from "builder-util-runtime"
import * as fs from "fs/promises"
import { mkdir, readdir } from "fs/promises"
import { Lazy } from "lazy-val"
import * as path from "path"
import { AppInfo } from "./appInfo"
import { CertType, CodeSigningInfo, createKeychain, CreateKeychainOptions, findIdentity, isSignAllowed, removeKeychain, reportError, sign } from "./codeSign/macCodeSign"
import { DIR_TARGET, Platform, Target } from "./core"
import { AfterPackContext, ElectronPlatformName } from "./index"
import { MacConfiguration, MasConfiguration } from "./options/macOptions"
import { Packager } from "./packager"
import { chooseNotNull, DoPackOptions, PlatformPackager } from "./platformPackager"
import { ArchiveTarget } from "./targets/ArchiveTarget"
import { PkgTarget, prepareProductBuildArgs } from "./targets/pkg"
import { createCommonTarget, NoOpTarget } from "./targets/targetFactory"
import { isMacOsHighSierra } from "./util/macosVersion"
import { getTemplatePath } from "./util/pathManager"
import { resolveFunction } from "./util/resolve"
import { expandMacro as doExpandMacro } from "./util/macroExpander"
import { makeUniversalApp } from "@electron/universal"

export type CustomMacSignOptions = SignOptions
export type CustomMacSign = (configuration: CustomMacSignOptions, packager: MacPackager) => Promise<void>

export class MacPackager extends PlatformPackager<MacConfiguration> {
  readonly codeSigningInfo = new MemoLazy<CreateKeychainOptions | null, CodeSigningInfo>(
    () => {
      const cscLink = this.getCscLink()
      if (cscLink == null || process.platform !== "darwin") {
        return null
      }

      const selected = {
        tmpDir: this.info.tempDirManager,
        cscLink,
        cscKeyPassword: this.getCscPassword(),
        cscILink: chooseNotNull(this.platformSpecificBuildOptions.cscInstallerLink, process.env.CSC_INSTALLER_LINK),
        cscIKeyPassword: chooseNotNull(this.platformSpecificBuildOptions.cscInstallerKeyPassword, process.env.CSC_INSTALLER_KEY_PASSWORD),
        currentDir: this.projectDir,
      }

      return selected
    },
    async selected => {
      if (selected) {
        return createKeychain(selected).then(result => {
          const keychainFile = result.keychainFile
          if (keychainFile != null) {
            this.info.disposeOnBuildFinish(() => removeKeychain(keychainFile))
          }
          return result
        })
      }

      return Promise.resolve({ keychainFile: process.env.CSC_KEYCHAIN || null })
    }
  )

  private _iconPath = new Lazy(() => this.getOrConvertIcon("icns"))

  constructor(info: Packager) {
    super(info, Platform.MAC)
  }

  get defaultTarget(): Array<string> {
    return this.info.framework.macOsDefaultTargets
  }

  expandArch(pattern: string, arch?: Arch | null): string[] {
    if (arch === Arch.universal) {
      // Universal build has `app-x64.asar.unpacked` & `app-arm64.asar.unpacked`
      return [doExpandMacro(pattern, Arch[Arch.arm64], this.appInfo, {}, false), doExpandMacro(pattern, Arch[Arch.x64], this.appInfo, {}, false)]
    }
    // Every other build keeps the name as `app.asar.unpacked`
    return [doExpandMacro(pattern, null, this.appInfo, {}, false)]
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected prepareAppInfo(appInfo: AppInfo): AppInfo {
    // codesign requires the filename to be normalized to the NFD form
    return new AppInfo(this.info, this.platformSpecificBuildOptions.bundleVersion, this.platformSpecificBuildOptions, true)
  }

  async getIconPath(): Promise<string | null> {
    return this._iconPath.value
  }

  createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void): void {
    for (const name of targets) {
      switch (name) {
        case DIR_TARGET:
          break

        case "dmg": {
          const { DmgTarget } = require("dmg-builder")
          mapper(name, outDir => new DmgTarget(this, outDir))
          break
        }

        case "zip":
          // https://github.com/electron-userland/electron-builder/issues/2313
          mapper(name, outDir => new ArchiveTarget(name, outDir, this, true))
          break

        case "pkg":
          mapper(name, outDir => new PkgTarget(this, outDir))
          break

        default:
          mapper(name, outDir => (name === "mas" || name === "mas-dev" ? new NoOpTarget(name) : createCommonTarget(name, outDir, this)))
          break
      }
    }
  }

  protected async doPack(config: DoPackOptions<MacConfiguration>): Promise<any> {
    const { outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets } = config

    switch (arch) {
      default: {
        return super.doPack(config)
      }
      case Arch.universal: {
        const outDirName = (arch: Arch) => `${appOutDir}-${Arch[arch]}-temp`
        const options = {
          ...config,
          options: {
            sign: false,
            disableAsarIntegrity: true,
            disableFuses: true,
          },
        }

        const x64Arch = Arch.x64
        const x64AppOutDir = outDirName(x64Arch)
        await super.doPack({ ...options, appOutDir: x64AppOutDir, arch: x64Arch })

        if (this.info.cancellationToken.cancelled) {
          return
        }

        const arm64Arch = Arch.arm64
        const arm64AppOutPath = outDirName(arm64Arch)
        await super.doPack({ ...options, appOutDir: arm64AppOutPath, arch: arm64Arch })

        if (this.info.cancellationToken.cancelled) {
          return
        }

        const framework = this.info.framework
        log.info(
          {
            platform: platformName,
            arch: Arch[arch],
            [`${framework.name}`]: framework.version,
            appOutDir: log.filePath(appOutDir),
          },
          `packaging`
        )
        const appFile = `${this.appInfo.productFilename}.app`

        // Make sure the Assets.car file is the same for both architectures
        const sourceCatalogPath = path.join(x64AppOutDir, appFile, "Contents/Resources/Assets.car")
        if (await exists(sourceCatalogPath)) {
          const targetCatalogPath = path.join(arm64AppOutPath, appFile, "Contents/Resources/Assets.car")
          await fs.copyFile(sourceCatalogPath, targetCatalogPath)
        }

        await makeUniversalApp({
          x64AppPath: path.join(x64AppOutDir, appFile),
          arm64AppPath: path.join(arm64AppOutPath, appFile),
          outAppPath: path.join(appOutDir, appFile),
          force: true,
          mergeASARs: platformSpecificBuildOptions.mergeASARs ?? true, // must be ?? to allow false
          singleArchFiles: platformSpecificBuildOptions.singleArchFiles || undefined,
          x64ArchFiles: platformSpecificBuildOptions.x64ArchFiles || undefined,
        })
        await fs.rm(x64AppOutDir, { recursive: true, force: true })
        await fs.rm(arm64AppOutPath, { recursive: true, force: true })

        // Give users a final opportunity to perform things on the combined universal package before signing
        const packContext: AfterPackContext = {
          appOutDir,
          outDir,
          arch,
          targets,
          packager: this,
          electronPlatformName: platformName,
        }
        await this.info.emitAfterPack(packContext)

        if (this.info.cancellationToken.cancelled) {
          return
        }

        await this.doAddElectronFuses(packContext)

        await this.doSignAfterPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)
        break
      }
    }
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, taskManager: AsyncTaskManager): Promise<void> {
    const hasMas = targets.length !== 0 && targets.some(it => it.name === "mas" || it.name === "mas-dev")
    const prepackaged = this.packagerOptions.prepackaged

    for (const target of targets) {
      const targetName = target.name
      if (!(targetName === "mas" || targetName === "mas-dev")) {
        continue
      }

      const masBuildOptions = deepAssign({}, this.platformSpecificBuildOptions, this.config.mas)
      if (targetName === "mas-dev") {
        deepAssign(masBuildOptions, this.config.masDev, {
          type: "development",
        })
      }

      const targetOutDir = path.join(outDir, `${targetName}${getArchSuffix(arch, this.platformSpecificBuildOptions.defaultArch)}`)
      if (prepackaged == null) {
        await this.doPack({ outDir, appOutDir: targetOutDir, platformName: "mas", arch, platformSpecificBuildOptions: masBuildOptions, targets: [target] })
        await this.sign(path.join(targetOutDir, `${this.appInfo.productFilename}.app`), targetOutDir, masBuildOptions, arch)
      } else {
        await this.sign(prepackaged, targetOutDir, masBuildOptions, arch)
      }
    }

    if (!hasMas || targets.length > 1) {
      const appPath = prepackaged == null ? path.join(this.computeAppOutDir(outDir, arch), `${this.appInfo.productFilename}.app`) : prepackaged
      if (prepackaged == null) {
        await this.doPack({
          outDir,
          appOutDir: path.dirname(appPath),
          platformName: this.platform.nodeName as ElectronPlatformName,
          arch,
          platformSpecificBuildOptions: this.platformSpecificBuildOptions,
          targets,
        })
      }
      this.packageInDistributableFormat(appPath, arch, targets, taskManager)
    }
  }

  private async sign(appPath: string, outDir: string | null, masOptions: MasConfiguration | null, arch: Arch): Promise<boolean> {
    if (!isSignAllowed()) {
      return false
    }

    const isMas = masOptions != null
    const options = masOptions == null ? this.platformSpecificBuildOptions : masOptions
    const qualifier = options.identity
    const fallBackToAdhoc = (arch === Arch.arm64 || arch === Arch.universal) && !this.forceCodeSigning

    if (qualifier === null) {
      if (this.forceCodeSigning) {
        throw new InvalidConfigurationError("identity explicitly is set to null, but forceCodeSigning is set to true")
      }
      log.info({ reason: "identity explicitly is set to null" }, "skipped macOS code signing")
      if (fallBackToAdhoc) {
        log.warn("arm64 requires signing, but identity is set to null and signing is being skipped")
      }
      return false
    }

    const keychainFile = (await this.codeSigningInfo.value).keychainFile
    const explicitType = options.type
    const type = explicitType || "distribution"
    const isDevelopment = type === "development"
    const certificateTypes = getCertificateTypes(isMas, isDevelopment)

    let identity = null
    for (const certificateType of certificateTypes) {
      identity = await findIdentity(certificateType, qualifier, keychainFile)
      if (identity != null) {
        break
      }
    }

    if (identity == null) {
      if (!isMas && !isDevelopment && explicitType !== "distribution") {
        identity = await findIdentity("Mac Developer", qualifier, keychainFile)
        if (identity != null) {
          log.warn("Mac Developer is used to sign app — it is only for development and testing, not for production")
        }
      }

      const noIdentity = !options.sign && identity == null
      if (qualifier === "-") {
        identity = new Identity("-", undefined)
      } else if (noIdentity && fallBackToAdhoc) {
        log.warn(null, "falling back to ad-hoc signature for macOS application code signing")
        identity = new Identity("-", undefined)
      } else if (noIdentity) {
        await reportError(isMas, certificateTypes, qualifier, keychainFile, this.forceCodeSigning)
        return false
      }
    }

    if (!isMacOsHighSierra()) {
      throw new InvalidConfigurationError("macOS High Sierra 10.13.6 is required to sign")
    }

    let filter = options.signIgnore
    if (Array.isArray(filter)) {
      if (filter.length == 0) {
        filter = null
      }
    } else if (filter != null) {
      filter = filter.length === 0 ? null : [filter]
    }

    const filterRe = filter == null ? null : filter.map(it => new RegExp(it))

    let binaries = options.binaries || undefined
    if (binaries) {
      // Accept absolute paths for external binaries, else resolve relative paths from the artifact's app Contents path.
      binaries = (
        await Promise.all(
          binaries.flatMap(async destination => {
            const expandedDestination = this.expandArch(destination, arch)
            return await Promise.all(
              expandedDestination.map(async d => {
                if (await statOrNull(d)) {
                  return d
                }
                return path.resolve(appPath, d)
              })
            )
          })
        )
      ).flat()
      log.info({ binaries, arch: arch == null ? null : Arch[arch] }, "signing additional user-defined binaries for arch")
    }
    const customSignOptions: MasConfiguration | MacConfiguration = (isMas ? masOptions : this.platformSpecificBuildOptions) || this.platformSpecificBuildOptions

    const signOptions: SignOptions = {
      identityValidation: false,
      // https://github.com/electron-userland/electron-builder/issues/1699
      // kext are signed by the chipset manufacturers. You need a special certificate (only available on request) from Apple to be able to sign kext.
      ignore: (file: string) => {
        if (filterRe != null) {
          for (const regExp of filterRe) {
            if (regExp.test(file)) {
              return true
            }
          }
        }
        return (
          file.endsWith(".kext") ||
          file.startsWith("/Contents/PlugIns", appPath.length) ||
          file.includes("/node_modules/puppeteer/.local-chromium") ||
          file.includes("/node_modules/playwright-firefox/.local-browsers") ||
          file.includes("/node_modules/playwright/.local-browsers")
        )

        /* Those are browser automating modules, browser (chromium, nightly) cannot be signed
          https://github.com/electron-userland/electron-builder/issues/2010
          https://github.com/electron-userland/electron-builder/issues/5383
          */
      },
      identity: identity ? identity.hash || identity.name : undefined,
      type,
      platform: isMas ? "mas" : "darwin",
      version: this.config.electronVersion || undefined,
      app: appPath,
      keychain: keychainFile || undefined,
      binaries,
      // https://github.com/electron-userland/electron-builder/issues/1480
      strictVerify: options.strictVerify,
      preAutoEntitlements: options.preAutoEntitlements,
      optionsForFile: await this.getOptionsForFile(appPath, isMas, customSignOptions),
      provisioningProfile: customSignOptions.provisioningProfile || undefined,
    }

    await this.doSign(signOptions, customSignOptions, identity)

    // https://github.com/electron-userland/electron-builder/issues/1196#issuecomment-312310209
    if (masOptions != null && !isDevelopment) {
      const certType = isDevelopment ? "Mac Developer" : "3rd Party Mac Developer Installer"
      const masInstallerIdentity = await findIdentity(certType, masOptions.identity, keychainFile)
      if (masInstallerIdentity == null) {
        throw new InvalidConfigurationError(`Cannot find valid "${certType}" identity to sign MAS installer, please see https://electron.build/code-signing`)
      }

      // mas uploaded to AppStore, so, use "-" instead of space for name
      const artifactName = this.expandArtifactNamePattern(masOptions, "pkg", arch)
      const artifactPath = path.join(outDir!, artifactName)
      await this.doFlat(appPath, artifactPath, masInstallerIdentity, keychainFile)
      await this.info.emitArtifactBuildCompleted({
        file: artifactPath,
        target: null,
        arch: Arch.x64,
        safeArtifactName: this.computeSafeArtifactName(artifactName, "pkg", arch, true, this.platformSpecificBuildOptions.defaultArch),
        packager: this,
      })
    }

    if (!isMas) {
      await this.notarizeIfProvided(appPath)
    }
    return true
  }

  private async getOptionsForFile(appPath: string, isMas: boolean, customSignOptions: MacConfiguration) {
    const resourceList = await this.resourceList
    const entitlementsSuffix = isMas ? "mas" : "mac"

    const getEntitlements = (filePath: string) => {
      // check if root app, then use main entitlements
      if (filePath === appPath) {
        if (customSignOptions.entitlements) {
          return customSignOptions.entitlements
        }
        const p = `entitlements.${entitlementsSuffix}.plist`
        if (resourceList.includes(p)) {
          return path.join(this.info.buildResourcesDir, p)
        } else {
          return getTemplatePath("entitlements.mac.plist")
        }
      }

      // It's a login helper...
      if (filePath.includes("Library/LoginItems")) {
        return customSignOptions.entitlementsLoginHelper
      }

      // Only remaining option is that it's inherited entitlements
      if (customSignOptions.entitlementsInherit) {
        return customSignOptions.entitlementsInherit
      }
      const p = `entitlements.${entitlementsSuffix}.inherit.plist`
      if (resourceList.includes(p)) {
        return path.join(this.info.buildResourcesDir, p)
      } else {
        return getTemplatePath("entitlements.mac.plist")
      }
    }

    const requirements = isMas || this.platformSpecificBuildOptions.requirements == null ? undefined : await this.getResource(this.platformSpecificBuildOptions.requirements)

    // harden by default for mac builds. Only harden mas builds if explicitly true (backward compatibility)
    const hardenedRuntime = isMas ? customSignOptions.hardenedRuntime === true : customSignOptions.hardenedRuntime !== false

    const optionsForFile: (filePath: string) => PerFileSignOptions = filePath => {
      const entitlements = getEntitlements(filePath)
      const args = {
        entitlements: entitlements || undefined,
        hardenedRuntime: hardenedRuntime ?? undefined,
        timestamp: customSignOptions.timestamp || undefined,
        requirements: requirements || undefined,
        additionalArguments: customSignOptions.additionalArguments || [],
      }
      log.debug({ file: log.filePath(filePath), ...args }, "selecting signing options")
      return args
    }
    return optionsForFile
  }

  //noinspection JSMethodCanBeStatic
  protected async doSign(opts: SignOptions, customSignOptions: MacConfiguration, identity: Identity | null): Promise<void> {
    const customSign = await resolveFunction(this.appInfo.type, customSignOptions.sign, "sign")

    const { app, platform, type, provisioningProfile } = opts
    log.info(
      {
        file: log.filePath(app),
        platform,
        type,
        identityName: identity?.name || "none",
        identityHash: identity?.hash || "none",
        provisioningProfile: provisioningProfile || "none",
      },
      customSign ? "executing custom sign" : "signing"
    )

    return customSign ? Promise.resolve(customSign(opts, this)) : sign({ ...opts, identity: identity ? identity.name : undefined })
  }

  //noinspection JSMethodCanBeStatic
  protected async doFlat(appPath: string, outFile: string, identity: Identity, keychain: string | Nullish): Promise<any> {
    // productbuild doesn't created directory for out file
    await mkdir(path.dirname(outFile), { recursive: true })

    const args = prepareProductBuildArgs(identity, keychain)
    args.push("--component", appPath, "/Applications")
    args.push(outFile)
    return await exec("productbuild", args)
  }

  public getElectronSrcDir(dist: string) {
    return path.resolve(this.projectDir, dist, this.info.framework.distMacOsAppName)
  }

  public getElectronDestinationDir(appOutDir: string) {
    return path.join(appOutDir, this.info.framework.distMacOsAppName)
  }

  // todo fileAssociations
  async applyCommonInfo(appPlist: any, contentsPath: string) {
    const appInfo = this.appInfo
    const appFilename = appInfo.productFilename

    // https://github.com/electron-userland/electron-builder/issues/1278
    appPlist.CFBundleExecutable = appFilename.endsWith(" Helper") ? appFilename.substring(0, appFilename.length - " Helper".length) : appFilename

    const resourcesPath = path.join(contentsPath, "Resources")

    // Support both legacy `.icns` and modern `.icon` (Icon Composer) inputs via `mac.icon`.
    // Prefer `.icon` if provided; still accept `.icns`.
    const configuredIcon = this.platformSpecificBuildOptions.icon
    const isIconComposer = typeof configuredIcon === "string" && configuredIcon.toLowerCase().endsWith(".icon")

    // Set the app name
    appPlist.CFBundleName = appInfo.productName
    appPlist.CFBundleDisplayName = appInfo.productName

    // Bundle legacy `icns` format - this should also run when `.icon` is provided
    const setIcnsFile = async (iconPath: string) => {
      const oldIcon = appPlist.CFBundleIconFile
      if (oldIcon != null) {
        await unlinkIfExists(path.join(resourcesPath, oldIcon))
      }
      const iconFileName = "icon.icns"
      appPlist.CFBundleIconFile = iconFileName
      await copyFile(iconPath, path.join(resourcesPath, iconFileName))
    }

    const icnsFilePath = await this.getIconPath()
    if (icnsFilePath != null) {
      await setIcnsFile(icnsFilePath)
    }

    // Bundle new `icon` format
    if (isIconComposer && configuredIcon) {
      const iconComposerPath = await this.getResource(configuredIcon)
      if (iconComposerPath) {
        const { assetCatalog } = await this.generateAssetCatalogData(iconComposerPath)

        // Create and setup the asset catalog
        appPlist.CFBundleIconName = "Icon"
        await fs.writeFile(path.join(resourcesPath, "Assets.car"), assetCatalog)
      }
    }

    const minimumSystemVersion = this.platformSpecificBuildOptions.minimumSystemVersion
    if (minimumSystemVersion != null) {
      appPlist.LSMinimumSystemVersion = minimumSystemVersion
    }

    appPlist.CFBundleShortVersionString = this.platformSpecificBuildOptions.bundleShortVersion || appInfo.version
    appPlist.CFBundleVersion = appInfo.buildVersion

    use(this.platformSpecificBuildOptions.category || (this.config as any).category, it => (appPlist.LSApplicationCategoryType = it))
    appPlist.NSHumanReadableCopyright = appInfo.copyright

    if (this.platformSpecificBuildOptions.darkModeSupport) {
      appPlist.NSRequiresAquaSystemAppearance = false
    }

    const extendInfo = this.platformSpecificBuildOptions.extendInfo
    if (extendInfo != null) {
      Object.assign(appPlist, extendInfo)
    }
    for (const [k, v] of Object.entries(appPlist)) {
      if (v === null || v === undefined) {
        delete appPlist[k]
      }
    }
  }

  protected async signApp(packContext: AfterPackContext, isAsar: boolean): Promise<boolean> {
    const readDirectoryAndSign = async (sourceDirectory: string, directories: string[], shouldSign: (file: string) => boolean): Promise<boolean> => {
      await Promise.all(
        directories.map(async (file: string) => {
          if (shouldSign(file)) {
            await this.sign(path.join(sourceDirectory, file), null, null, packContext.arch)
          }
        })
      )
      return true
    }

    const appFileName = `${this.appInfo.productFilename}.app`
    await readDirectoryAndSign(packContext.appOutDir, await readdir(packContext.appOutDir), file => file === appFileName)
    if (!isAsar) {
      return true
    }

    const outResourcesDir = path.join(packContext.appOutDir, "resources", "app.asar.unpacked")
    await readDirectoryAndSign(outResourcesDir, await orIfFileNotExist(readdir(outResourcesDir), []), file => file.endsWith(".app"))

    return true
  }

  async notarizeIfProvided(appPath: string) {
    const notarizeOptions = this.platformSpecificBuildOptions.notarize
    if (notarizeOptions === false) {
      log.info({ reason: "`notarize` options were set explicitly `false`" }, "skipped macOS notarization")
      return
    }
    const options = this.getNotarizeOptions(appPath)
    if (!options) {
      log.warn({ reason: "`notarize` options were unable to be generated" }, "skipped macOS notarization")
      return
    }
    await notarize(options)
    log.info(null, "notarization successful")
  }

  private getNotarizeOptions(appPath: string): NotarizeOptionsNotaryTool | undefined {
    const teamId = process.env.APPLE_TEAM_ID
    const appleId = process.env.APPLE_ID
    const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD
    const tool = "notarytool"

    // option 1: app specific password
    if (appleId || appleIdPassword) {
      if (!appleId) {
        throw new InvalidConfigurationError(`APPLE_ID env var needs to be set`)
      }
      if (!appleIdPassword) {
        throw new InvalidConfigurationError(`APPLE_APP_SPECIFIC_PASSWORD env var needs to be set`)
      }
      if (!teamId) {
        throw new InvalidConfigurationError(`APPLE_TEAM_ID env var needs to be set`)
      }
      return { tool, appPath, appleId, appleIdPassword, teamId }
    }

    // option 2: API key
    const appleApiKey = process.env.APPLE_API_KEY
    const appleApiKeyId = process.env.APPLE_API_KEY_ID
    const appleApiIssuer = process.env.APPLE_API_ISSUER
    if (appleApiKey || appleApiKeyId || appleApiIssuer) {
      if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
        throw new InvalidConfigurationError(`Env vars APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER need to be set`)
      }
      return { tool, appPath, appleApiKey, appleApiKeyId, appleApiIssuer }
    }

    // option 3: keychain
    const keychain = process.env.APPLE_KEYCHAIN
    const keychainProfile = process.env.APPLE_KEYCHAIN_PROFILE
    if (keychainProfile) {
      let args: NotaryToolKeychainCredentials = { keychainProfile }
      if (keychain) {
        args = { ...args, keychain }
      }
      return { tool, appPath, ...args }
    }

    // if no credentials provided, skip silently
    return undefined
  }
}

function getCertificateTypes(isMas: boolean, isDevelopment: boolean): CertType[] {
  if (isDevelopment) {
    return isMas ? ["Mac Developer", "Apple Development"] : ["Mac Developer", "Developer ID Application"]
  }
  return isMas ? ["Apple Distribution", "3rd Party Mac Developer Application"] : ["Developer ID Application"]
}
