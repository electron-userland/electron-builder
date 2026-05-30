import { SignOptions } from "@electron/osx-sign/dist/cjs/types"
import { Identity } from "@electron/osx-sign/dist/cjs/util-identities"
import { makeUniversalApp } from "@electron/universal"
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
  sanitizeDirPath,
  unlinkIfExists,
  use,
} from "builder-util"
import { MemoLazy, Nullish } from "builder-util-runtime"
import * as fs from "fs/promises"
import { mkdir, readdir } from "fs/promises"
import { Lazy } from "lazy-val"
import * as path from "path"
import { AppInfo } from "./appInfo"
import { CodeSigningInfo, createKeychain, CreateKeychainOptions, isSignAllowed, removeKeychain, sign } from "./codeSign/macCodeSign"
import { DIR_TARGET, Platform, Target } from "./core"
import { AfterPackContext, ElectronPlatformName } from "./index"
import { MacTargetHelper, PlatformType } from "./mac/MacTargetHelper"
import { MacConfiguration, MasConfiguration } from "./options/macOptions"
import { Packager } from "./packager"
import { chooseNotNull, DoPackOptions, PlatformPackager } from "./platformPackager"
import { ArchiveTarget } from "./targets/ArchiveTarget"
import { PkgTarget, prepareProductBuildArgs } from "./targets/pkg"
import { createCommonTarget, NoOpTarget } from "./targets/targetFactory"
import { isMacOsHighSierra } from "./util/macosVersion"
import { expandMacro as doExpandMacro } from "./util/macroExpander"
import { resolveFunction } from "./util/resolve"

export type CustomMacSignOptions = SignOptions
export type CustomMacSign = (configuration: CustomMacSignOptions, packager: MacPackager) => Promise<void>

interface PlatformConfig {
  type: PlatformType
  config: MacConfiguration | MasConfiguration
  isDevelopment: boolean
  platformName: ElectronPlatformName
}

export class MacPackager extends PlatformPackager<MacConfiguration | MasConfiguration> {
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

  // Set/cleared in doPack so applyCommonInfo can read the per-pack platformSpecificBuildOptions
  // (the framework call chain doesn't thread it through to applyCommonInfo). Fixes #8909.
  private _activePackConfig: MacConfiguration | MasConfiguration | null = null

  readonly helper = new MacTargetHelper(this)

  constructor(info: Packager) {
    super(info, Platform.MAC)
  }

  get defaultTarget(): Array<string> {
    return this.info.framework.macOsDefaultTargets
  }

  /**
   * Get the merged configuration for a specific platform type
   */
  private getPlatformConfig(platformType: PlatformType): PlatformConfig {
    let config: MacConfiguration | MasConfiguration
    let isDevelopment = false
    let platformName: ElectronPlatformName

    switch (platformType) {
      case "mas":
        config = deepAssign({}, this.platformSpecificBuildOptions, this.config.mas)
        isDevelopment = false
        platformName = "mas"
        break

      case "mas-dev":
        config = deepAssign({}, this.platformSpecificBuildOptions, this.config.mas, this.config.masDev, {
          type: "development",
        })
        isDevelopment = true
        platformName = "mas"
        break

      case "mac":
      default:
        config = this.platformSpecificBuildOptions
        isDevelopment = false
        platformName = this.platform.nodeName as ElectronPlatformName
        break
    }

    return { type: platformType, config, isDevelopment, platformName }
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
          mapper(name, outDir => (MacTargetHelper.isMasTarget(name) ? new NoOpTarget(name) : createCommonTarget(name, outDir, this)))
          break
      }
    }
  }

  protected async doPack(config: DoPackOptions<MacConfiguration>): Promise<any> {
    if (config.arch === Arch.universal) {
      return this.doUniversalPack(config)
    }
    // Bridge the per-pack platformSpecificBuildOptions to applyCommonInfo, which is called deep in the
    // framework stack (doPack → beforeCopyExtraFiles → createMacApp → applyCommonInfo) without it.
    this._activePackConfig = config.platformSpecificBuildOptions
    try {
      return await super.doPack(config)
    } finally {
      this._activePackConfig = null
    }
  }

  /**
   * Handle universal build packing
   */
  private async doUniversalPack(config: DoPackOptions<MacConfiguration>): Promise<void> {
    this._activePackConfig = config.platformSpecificBuildOptions
    try {
      const { outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets } = config

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
      const safeX64AppOutDir = sanitizeDirPath(x64AppOutDir)
      const safeArm64AppOutPath = sanitizeDirPath(arm64AppOutPath)
      const safeAppOutDir = sanitizeDirPath(appOutDir)

      const sourceCatalogPath = path.join(safeX64AppOutDir, appFile, "Contents/Resources/Assets.car")
      if (await exists(sourceCatalogPath)) {
        const targetCatalogPath = path.join(safeArm64AppOutPath, appFile, "Contents/Resources/Assets.car")
        await fs.copyFile(sourceCatalogPath, targetCatalogPath)
      }

      await makeUniversalApp({
        x64AppPath: path.join(safeX64AppOutDir, appFile),
        arm64AppPath: path.join(safeArm64AppOutPath, appFile),
        outAppPath: path.join(safeAppOutDir, appFile),
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

      // Mirror the base-class guard: skip signing when the caller explicitly set sign:false
      // (e.g. packMasTargets passes sign:false so that signMas() is the sole signing step).
      if (config.options?.sign ?? true) {
        await this.doSignAfterPack(outDir, appOutDir, platformName, arch, platformSpecificBuildOptions, targets)
      }
    } finally {
      this._activePackConfig = null
    }
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, taskManager: AsyncTaskManager): Promise<void> {
    const masTargets = targets.filter(it => MacTargetHelper.isMasTarget(it.name))
    const nonMasTargets = targets.filter(it => !MacTargetHelper.isMasTarget(it.name))
    const prepackaged = this.packagerOptions.prepackaged
    const hasMas = masTargets.length > 0

    // mas always first
    await this.packMasTargets(outDir, arch, masTargets, prepackaged)

    // Mirror master's condition: skip the non-MAS darwin pack only when there are exclusively MAS
    // targets (hasMas=true, targets.length=1). DIR_TARGET passes targets=[] to pack() because
    // MacPackager.createTargets() doesn't call mapper() for it, so hasMas=false and doPack still runs.
    if (!hasMas || targets.length > 1) {
      await this.packMacTargets(outDir, arch, nonMasTargets, prepackaged, taskManager)
    }
  }

  private async packMasTargets(outDir: string, arch: Arch, targets: Array<Target>, prepackaged: string | null | undefined): Promise<void> {
    const resolvedOutDir = path.resolve(outDir)
    MacTargetHelper.assertSafePathForCommandUsage(resolvedOutDir, "output directory")

    for (const target of targets) {
      const platformType = MacTargetHelper.getPlatformTypeFromTarget(target.name)
      const platformConfig = this.getPlatformConfig(platformType)
      const targetOutDir = path.resolve(resolvedOutDir, `${target.name}${getArchSuffix(arch, this.platformSpecificBuildOptions.defaultArch)}`)
      MacTargetHelper.assertSafePathForCommandUsage(targetOutDir, "target output directory")

      const relativeTargetOutDir = path.relative(resolvedOutDir, targetOutDir)
      if (relativeTargetOutDir.startsWith("..") || path.isAbsolute(relativeTargetOutDir)) {
        throw new InvalidConfigurationError(`Invalid target output directory: ${targetOutDir}`)
      }

      if (prepackaged == null) {
        await this.doPack({
          outDir: resolvedOutDir,
          appOutDir: targetOutDir,
          platformName: platformConfig.platformName,
          arch,
          platformSpecificBuildOptions: platformConfig.config,
          targets: [target],
          options: { sign: false },
        })
        MacTargetHelper.assertSafePathForCommandUsage(this.appInfo.productFilename, "product filename")
        await this.signMas(path.resolve(targetOutDir, `${path.basename(this.appInfo.productFilename)}.app`), targetOutDir, platformConfig, arch)
      } else {
        await this.signMas(prepackaged, targetOutDir, platformConfig, arch)
      }
    }
  }

  private async packMacTargets(outDir: string, arch: Arch, targets: Array<Target>, prepackaged: string | null | undefined, taskManager: AsyncTaskManager): Promise<void> {
    const appPath = prepackaged == null ? path.join(this.computeAppOutDir(outDir, arch), `${path.basename(this.appInfo.productFilename)}.app`) : prepackaged

    if (prepackaged == null) {
      const platformConfig = this.getPlatformConfig("mac")
      await this.doPack({
        outDir,
        appOutDir: path.dirname(appPath),
        platformName: platformConfig.platformName,
        arch,
        platformSpecificBuildOptions: platformConfig.config,
        targets,
      })
    }

    this.packageInDistributableFormat(appPath, arch, targets, taskManager)
  }

  private async signMas(appPath: string, outDir: string, platformConfig: PlatformConfig, arch: Arch): Promise<boolean> {
    const signed = await this.sign(appPath, outDir, platformConfig.config as MasConfiguration, arch, true)
    return signed
  }

  /**
   * Main signing method with platform awareness
   */
  private async sign(appPath: string, outDir: string | null, options: MasConfiguration | MacConfiguration | null, arch: Arch, isMas: boolean = false): Promise<boolean> {
    if (!isSignAllowed()) {
      return false
    }

    const config = options ?? this.platformSpecificBuildOptions
    const qualifier = config.identity
    const fallBackToAdhoc = (arch === Arch.arm64 || arch === Arch.universal) && !this.forceCodeSigning

    if (qualifier === null) {
      return this.helper.handleNullIdentity(fallBackToAdhoc)
    }

    const keychainFile = (await this.codeSigningInfo.value).keychainFile
    const explicitType = config.type
    const type = explicitType || "distribution"
    const isDevelopment = type === "development"

    const identity = await this.helper.findSigningIdentity(isMas, isDevelopment, qualifier, keychainFile, config, fallBackToAdhoc)

    if (!identity) {
      return false
    }

    if (!isMacOsHighSierra()) {
      throw new InvalidConfigurationError("macOS High Sierra 10.13.6 is required to sign")
    }

    const signOptions = await this.helper.buildSignOptions(appPath, identity, type, isMas, config, keychainFile, arch)
    await this.doSign(signOptions, config, identity)

    // Handle MAS installer creation
    if (isMas && !isDevelopment && outDir) {
      await this.helper.createMasInstaller(appPath, outDir, config as MasConfiguration, keychainFile, isDevelopment, arch)
    }

    // Handle notarization for non-MAS builds
    if (!isMas) {
      await this.helper.notarizeIfProvided(appPath)
    }

    return true
  }

  //noinspection JSMethodCanBeStatic
  protected async doSign(opts: SignOptions, customSignOptions: MacConfiguration | MasConfiguration, identity: Identity | null): Promise<void> {
    const customSign = await resolveFunction(this.appInfo.type, customSignOptions.sign, "sign", await this.info.getWorkspaceRoot())

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
  public async doFlat(appPath: string, outFile: string, identity: Identity, keychain: string | Nullish): Promise<any> {
    const safeAppPath = sanitizeDirPath(appPath)
    const safeOutFile = sanitizeDirPath(outFile)
    // productbuild doesn't created directory for out file
    await mkdir(path.dirname(safeOutFile), { recursive: true })

    const args = prepareProductBuildArgs(identity, keychain)
    args.push("--component", safeAppPath, "/Applications")
    args.push(safeOutFile)
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

    const activeOpts = this._activePackConfig ?? this.platformSpecificBuildOptions
    appPlist.CFBundleShortVersionString = activeOpts.bundleShortVersion || appInfo.version
    appPlist.CFBundleVersion = activeOpts.bundleVersion || appInfo.buildVersion

    use(this.platformSpecificBuildOptions.category || (this.config as any).category, it => (appPlist.LSApplicationCategoryType = it))
    appPlist.NSHumanReadableCopyright = appInfo.copyright

    if (this.platformSpecificBuildOptions.darkModeSupport) {
      appPlist.NSRequiresAquaSystemAppearance = false
    }

    const extendInfo = this.platformSpecificBuildOptions.extendInfo
    if (extendInfo != null) {
      deepAssign(appPlist, extendInfo)
    }
    for (const [k, v] of Object.entries(appPlist)) {
      if (v === null || v === undefined) {
        delete appPlist[k]
      }
    }
  }

  protected async signApp(packContext: AfterPackContext, isAsar: boolean): Promise<boolean> {
    const isMas = packContext.electronPlatformName === "mas"
    const activeConfig = this._activePackConfig ?? this.platformSpecificBuildOptions
    const readDirectoryAndSign = async (sourceDirectory: string, directories: string[], shouldSign: (file: string) => boolean): Promise<boolean> => {
      const normalizedSourceDirectory = path.resolve(sourceDirectory)
      MacTargetHelper.assertSafePathForCommandUsage(normalizedSourceDirectory, "application output directory")
      await Promise.all(
        directories.map(async (file: string) => {
          if (shouldSign(file)) {
            const entryName = path.basename(file)
            if (file !== entryName) {
              throw new InvalidConfigurationError(`Invalid entry name in source directory: ${file}`)
            }
            const signTarget = path.resolve(normalizedSourceDirectory, entryName)
            const safeSignTarget = sanitizeDirPath(signTarget, normalizedSourceDirectory)
            await this.sign(safeSignTarget, null, isMas ? activeConfig : null, packContext.arch, isMas)
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
}
