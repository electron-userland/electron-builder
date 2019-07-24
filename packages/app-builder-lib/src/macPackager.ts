import BluebirdPromise from "bluebird-lst"
import { deepAssign, Arch, AsyncTaskManager, exec, InvalidConfigurationError, log, use } from "builder-util"
import { signAsync, SignOptions } from "../electron-osx-sign"
import { mkdirs, readdir } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { copyFile, unlinkIfExists } from "builder-util/out/fs"
import { orIfFileNotExist } from "builder-util/out/promise"
import { AppInfo } from "./appInfo"
import { CertType, CodeSigningInfo, createKeychain, findIdentity, Identity, isSignAllowed, removeKeychain, reportError } from "./codeSign/macCodeSign"
import { DIR_TARGET, Platform, Target } from "./core"
import { AfterPackContext, ElectronPlatformName } from "./index"
import { MacConfiguration, MasConfiguration } from "./options/macOptions"
import { Packager } from "./packager"
import { chooseNotNull, PlatformPackager } from "./platformPackager"
import { ArchiveTarget } from "./targets/ArchiveTarget"
import { PkgTarget, prepareProductBuildArgs } from "./targets/pkg"
import { createCommonTarget, NoOpTarget } from "./targets/targetFactory"
import { isMacOsHighSierra } from "./util/macosVersion"
import { getTemplatePath } from "./util/pathManager"

export default class MacPackager extends PlatformPackager<MacConfiguration> {
  readonly codeSigningInfo = new Lazy<CodeSigningInfo>(() => {
    const cscLink = this.getCscLink()
    if (cscLink == null || process.platform !== "darwin") {
      return Promise.resolve({keychainFile: process.env.CSC_KEYCHAIN || null})
    }

    return createKeychain({
      tmpDir: this.info.tempDirManager,
      cscLink,
      cscKeyPassword: this.getCscPassword(),
      cscILink: chooseNotNull(this.platformSpecificBuildOptions.cscInstallerLink, process.env.CSC_INSTALLER_LINK),
      cscIKeyPassword: chooseNotNull(this.platformSpecificBuildOptions.cscInstallerKeyPassword, process.env.CSC_INSTALLER_KEY_PASSWORD),
      currentDir: this.projectDir
    })
      .then(result => {
        const keychainFile = result.keychainFile
        if (keychainFile != null) {
          this.info.disposeOnBuildFinish(() => removeKeychain(keychainFile))
        }
        return result
      })
  })

  private _iconPath = new Lazy(() => this.getOrConvertIcon("icns"))

  constructor(info: Packager) {
    super(info, Platform.MAC)
  }

  get defaultTarget(): Array<string> {
    return this.info.framework.macOsDefaultTargets
  }

  protected prepareAppInfo(appInfo: AppInfo): AppInfo {
    return new AppInfo(this.info, this.platformSpecificBuildOptions.bundleVersion, this.platformSpecificBuildOptions)
  }

  async getIconPath(): Promise<string | null> {
    return this._iconPath.value
  }

  createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void): void {
    for (const name of targets) {
      switch (name) {
        case DIR_TARGET:
          break

        case "dmg":
          const { DmgTarget } = require("dmg-builder")
          mapper(name, outDir => new DmgTarget(this, outDir))
          break

        case "zip":
          // https://github.com/electron-userland/electron-builder/issues/2313
          mapper(name, outDir => new ArchiveTarget(name, outDir, this, true))
          break

        case "pkg":
          mapper(name, outDir => new PkgTarget(this, outDir))
          break

        default:
          mapper(name, outDir => name === "mas" || name === "mas-dev" ? new NoOpTarget(name) : createCommonTarget(name, outDir, this))
          break
      }
    }
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, taskManager: AsyncTaskManager): Promise<any> {
    let nonMasPromise: Promise<any> | null = null

    const hasMas = targets.length !== 0 && targets.some(it => it.name === "mas" || it.name === "mas-dev")
    const prepackaged = this.packagerOptions.prepackaged

    if (!hasMas || targets.length > 1) {
      const appPath = prepackaged == null ? path.join(this.computeAppOutDir(outDir, arch), `${this.appInfo.productFilename}.app`) : prepackaged
      nonMasPromise = (prepackaged ? Promise.resolve() : this.doPack(outDir, path.dirname(appPath), this.platform.nodeName as ElectronPlatformName, arch, this.platformSpecificBuildOptions, targets))
        .then(() => this.packageInDistributableFormat(appPath, Arch.x64, targets, taskManager))
    }

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

      const targetOutDir = path.join(outDir, targetName)
      if (prepackaged == null) {
        await this.doPack(outDir, targetOutDir, "mas", arch, masBuildOptions, [target])
        await this.sign(path.join(targetOutDir, `${this.appInfo.productFilename}.app`), targetOutDir, masBuildOptions)
      }
      else {
        await this.sign(prepackaged, targetOutDir, masBuildOptions)
      }
    }

    if (nonMasPromise != null) {
      await nonMasPromise
    }
  }

  private async sign(appPath: string, outDir: string | null, masOptions: MasConfiguration | null): Promise<void> {
    if (!isSignAllowed()) {
      return
    }

    const isMas = masOptions != null
    const options = masOptions == null ? this.platformSpecificBuildOptions : masOptions
    const qualifier = options.identity

    if (!isMas && qualifier === null) {
      if (this.forceCodeSigning) {
        throw new InvalidConfigurationError("identity explicitly is set to null, but forceCodeSigning is set to true")
      }
      log.info({reason: "identity explicitly is set to null"}, "skipped macOS code signing")
      return
    }

    const keychainFile = (await this.codeSigningInfo.value).keychainFile
    const explicitType = options.type
    const type = explicitType || "distribution"
    const isDevelopment = type === "development"
    const certificateType = getCertificateType(isMas, isDevelopment)
    let identity = await findIdentity(certificateType, qualifier, keychainFile)
    if (identity == null) {
      if (!isMas && !isDevelopment && explicitType !== "distribution") {
        identity = await findIdentity("Mac Developer", qualifier, keychainFile)
        if (identity != null) {
          log.warn("Mac Developer is used to sign app — it is only for development and testing, not for production")
        }
      }

      if (identity == null) {
        await reportError(isMas, certificateType, qualifier, keychainFile, this.forceCodeSigning)
        return
      }
    }

    if (!isMacOsHighSierra()) {
      throw new InvalidConfigurationError("macOS High Sierra 10.13.6 is required to sign")
    }

    const signOptions: any = {
      "identity-validation": false,
      // https://github.com/electron-userland/electron-builder/issues/1699
      // kext are signed by the chipset manufacturers. You need a special certificate (only available on request) from Apple to be able to sign kext.
      ignore: (file: string) => {
        return file.endsWith(".kext") || file.startsWith("/Contents/PlugIns", appPath.length) ||
          // https://github.com/electron-userland/electron-builder/issues/2010
          file.includes("/node_modules/puppeteer/.local-chromium")
      },
      identity: identity!,
      type,
      platform: isMas ? "mas" : "darwin",
      version: this.config.electronVersion,
      app: appPath,
      keychain: keychainFile || undefined,
      binaries: options.binaries || undefined,
      requirements: isMas || this.platformSpecificBuildOptions.requirements == null ? undefined : await this.getResource(this.platformSpecificBuildOptions.requirements),
      // https://github.com/electron-userland/electron-osx-sign/issues/196
      // will fail on 10.14.5+ because a signed but unnotarized app is also rejected.
      "gatekeeper-assess": options.gatekeeperAssess === true,
      hardenedRuntime: options.hardenedRuntime !== false,
    }

    await this.adjustSignOptions(signOptions, masOptions)
    log.info({
      file: log.filePath(appPath),
      identityName: identity.name,
      identityHash: identity.hash,
      provisioningProfile: signOptions["provisioning-profile"] || "none",
    }, "signing")
    await this.doSign(signOptions)

    // https://github.com/electron-userland/electron-builder/issues/1196#issuecomment-312310209
    if (masOptions != null && !isDevelopment) {
      const certType = isDevelopment ? "Mac Developer" : "3rd Party Mac Developer Installer"
      const masInstallerIdentity = await findIdentity(certType, masOptions.identity, keychainFile)
      if (masInstallerIdentity == null) {
        throw new InvalidConfigurationError(`Cannot find valid "${certType}" identity to sign MAS installer, please see https://electron.build/code-signing`)
      }

      // mas uploaded to AppStore, so, use "-" instead of space for name
      const artifactName = this.expandArtifactNamePattern(masOptions, "pkg")
      const artifactPath = path.join(outDir!, artifactName)
      await this.doFlat(appPath, artifactPath, masInstallerIdentity, keychainFile)
      await this.dispatchArtifactCreated(artifactPath, null, Arch.x64, this.computeSafeArtifactName(artifactName, "pkg"))
    }
  }

  private async adjustSignOptions(signOptions: any, masOptions: MasConfiguration | null) {
    const resourceList = await this.resourceList
    const customSignOptions = masOptions || this.platformSpecificBuildOptions
    const entitlementsSuffix = masOptions == null ? "mac" : "mas"

    let entitlements = customSignOptions.entitlements
    if (entitlements == null) {
      const p = `entitlements.${entitlementsSuffix}.plist`
      if (resourceList.includes(p)) {
        entitlements = path.join(this.info.buildResourcesDir, p)
      }
      else {
        entitlements = getTemplatePath("entitlements.mac.plist")
      }
    }
    signOptions.entitlements = entitlements

    let entitlementsInherit = customSignOptions.entitlementsInherit
    if (entitlementsInherit == null) {
      const p = `entitlements.${entitlementsSuffix}.inherit.plist`
      if (resourceList.includes(p)) {
        entitlementsInherit = path.join(this.info.buildResourcesDir, p)
      }
      else {
        entitlementsInherit = getTemplatePath("entitlements.mac.plist")
      }
    }
    signOptions["entitlements-inherit"] = entitlementsInherit

    if (customSignOptions.provisioningProfile != null) {
      signOptions["provisioning-profile"] = customSignOptions.provisioningProfile
    }
  }

  //noinspection JSMethodCanBeStatic
  protected async doSign(opts: SignOptions): Promise<any> {
    return signAsync(opts)
  }

  //noinspection JSMethodCanBeStatic
  protected async doFlat(appPath: string, outFile: string, identity: Identity, keychain: string | null | undefined): Promise<any> {
    // productbuild doesn't created directory for out file
    await mkdirs(path.dirname(outFile))

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

    const icon = await this.getIconPath()
    if (icon != null) {
      const oldIcon = appPlist.CFBundleIconFile
      const resourcesPath = path.join(contentsPath, "Resources")
      if (oldIcon != null) {
        await unlinkIfExists(path.join(resourcesPath, oldIcon))
      }
      const iconFileName = `${appFilename}.icns`
      appPlist.CFBundleIconFile = iconFileName
      await copyFile(icon, path.join(resourcesPath, iconFileName))
    }
    appPlist.CFBundleName = appInfo.productName
    appPlist.CFBundleDisplayName = appInfo.productName

    const minimumSystemVersion = this.platformSpecificBuildOptions.minimumSystemVersion
    if (minimumSystemVersion != null) {
      appPlist.LSMinimumSystemVersion = minimumSystemVersion
    }

    appPlist.CFBundleIdentifier = appInfo.macBundleIdentifier

    appPlist.CFBundleShortVersionString = this.platformSpecificBuildOptions.bundleShortVersion || appInfo.version
    appPlist.CFBundleVersion = appInfo.buildVersion

    use(this.platformSpecificBuildOptions.category || (this.config as any).category, it => appPlist.LSApplicationCategoryType = it)
    appPlist.NSHumanReadableCopyright = appInfo.copyright

    if (this.platformSpecificBuildOptions.darkModeSupport) {
      appPlist.NSRequiresAquaSystemAppearance = false
    }

    const extendInfo = this.platformSpecificBuildOptions.extendInfo
    if (extendInfo != null) {
      Object.assign(appPlist, extendInfo)
    }
  }

  protected async signApp(packContext: AfterPackContext, isAsar: boolean): Promise<any> {
    const appFileName = `${this.appInfo.productFilename}.app`

    await BluebirdPromise.map(readdir(packContext.appOutDir), (file: string): any => {
      if (file === appFileName) {
        return this.sign(path.join(packContext.appOutDir, file), null, null)
      }
      return null
    })

    if (!isAsar) {
      return
    }

    const outResourcesDir = path.join(packContext.appOutDir, "resources", "app.asar.unpacked")
    await BluebirdPromise.map(orIfFileNotExist(readdir(outResourcesDir), []), (file: string): any => {
      if (file.endsWith(".app")) {
        return this.sign(path.join(outResourcesDir, file), null, null)
      }
      else {
        return null
      }
    })
  }
}

function getCertificateType(isMas: boolean, isDevelopment: boolean): CertType {
  if (isDevelopment) {
    return "Mac Developer"
  }
  return isMas ? "3rd Party Mac Developer Application" : "Developer ID Application"
}
