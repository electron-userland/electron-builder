import { deepAssign, Arch, AsyncTaskManager, exec, InvalidConfigurationError, log, use } from "builder-util"
import { signAsync, SignOptions } from "electron-osx-sign"
import { ensureDir } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { copyFile, unlinkIfExists } from "builder-util/out/fs"
import { AppInfo } from "./appInfo"
import { appleCertificatePrefixes, CertType, CodeSigningInfo, createKeychain, findIdentity, Identity, isSignAllowed, reportError } from "./codeSign"
import { DIR_TARGET, Platform, Target } from "./core"
import { MacConfiguration, MasConfiguration } from "./options/macOptions"
import { Packager } from "./packager"
import { chooseNotNull, PlatformPackager } from "./platformPackager"
import { ArchiveTarget } from "./targets/ArchiveTarget"
import { PkgTarget, prepareProductBuildArgs } from "./targets/pkg"
import { createCommonTarget, NoOpTarget } from "./targets/targetFactory"

export default class MacPackager extends PlatformPackager<MacConfiguration> {
  readonly codeSigningInfo = new Lazy<CodeSigningInfo>(() => {
    const cscLink = this.getCscLink()
    if (cscLink == null || process.platform !== "darwin") {
      return Promise.resolve({keychainName: process.env.CSC_KEYCHAIN || null})
    }

    return createKeychain({
      tmpDir: this.info.tempDirManager,
      cscLink,
      cscKeyPassword: this.getCscPassword(),
      cscILink: chooseNotNull(this.platformSpecificBuildOptions.cscInstallerLink, process.env.CSC_INSTALLER_LINK),
      cscIKeyPassword: chooseNotNull(this.platformSpecificBuildOptions.cscInstallerKeyPassword, process.env.CSC_INSTALLER_KEY_PASSWORD),
      currentDir: this.projectDir
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
    return new AppInfo(this.info, this.platformSpecificBuildOptions.bundleVersion)
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
      nonMasPromise = (prepackaged ? Promise.resolve() : this.doPack(outDir, path.dirname(appPath), this.platform.nodeName, arch, this.platformSpecificBuildOptions, targets))
        .then(() => this.sign(appPath, null, null))
        .then(() => this.packageInDistributableFormat(appPath, Arch.x64, targets, taskManager))
    }

    for (const target of targets) {
      const targetName = target.name
      if (!(targetName === "mas" || targetName === "mas-dev")) {
        continue
      }

      const masBuildOptions = deepAssign({}, this.platformSpecificBuildOptions, (this.config as any).mas)
      if (targetName === "mas-dev") {
        deepAssign(masBuildOptions, (this.config as any)[targetName], {
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
    const macOptions = this.platformSpecificBuildOptions
    const qualifier = (isMas ? masOptions!.identity : null) || macOptions.identity

    if (!isMas && qualifier === null) {
      if (this.forceCodeSigning) {
        throw new InvalidConfigurationError("identity explicitly is set to null, but forceCodeSigning is set to true")
      }
      log.info({reason: "identity explicitly is set to null"}, "skipped macOS code signing")
      return
    }

    const keychainName = (await this.codeSigningInfo.value).keychainName
    const explicitType = isMas ? masOptions!.type : macOptions.type
    const type = explicitType || "distribution"
    const isDevelopment = type === "development"
    const certificateType = getCertificateType(isMas, isDevelopment)
    let identity = await findIdentity(certificateType, qualifier, keychainName)
    if (identity == null) {
      if (!isMas && !isDevelopment && explicitType !== "distribution") {
        identity = await findIdentity("Mac Developer", qualifier, keychainName)
        if (identity != null) {
          log.warn("Mac Developer is used to sign app — it is only for development and testing, not for production")
        }
      }

      if (identity == null) {
        await reportError(isMas, certificateType, qualifier, keychainName, this.forceCodeSigning)
        return
      }
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
      keychain: keychainName || undefined,
      binaries: (isMas && masOptions != null ? masOptions.binaries : macOptions.binaries) || undefined,
      requirements: isMas || macOptions.requirements == null ? undefined : await this.getResource(macOptions.requirements),
      "gatekeeper-assess": appleCertificatePrefixes.find(it => identity!.name.startsWith(it)) != null
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
      const masInstallerIdentity = await findIdentity(certType, masOptions.identity, keychainName)
      if (masInstallerIdentity == null) {
        throw new InvalidConfigurationError(`Cannot find valid "${certType}" identity to sign MAS installer, please see https://electron.build/code-signing`)
      }

      const artifactName = this.expandArtifactNamePattern(masOptions, "pkg")
      const artifactPath = path.join(outDir!, artifactName)
      await this.doFlat(appPath, artifactPath, masInstallerIdentity, keychainName)
      this.dispatchArtifactCreated(artifactPath, null, Arch.x64, this.computeSafeArtifactName(artifactName, "pkg"))
    }
  }

  private async adjustSignOptions(signOptions: any, masOptions: MasConfiguration | null) {
    const resourceList = await this.resourceList
    if (resourceList.includes(`entitlements.osx.plist`)) {
      throw new InvalidConfigurationError("entitlements.osx.plist is deprecated name, please use entitlements.mac.plist")
    }
    if (resourceList.includes(`entitlements.osx.inherit.plist`)) {
      throw new InvalidConfigurationError("entitlements.osx.inherit.plist is deprecated name, please use entitlements.mac.inherit.plist")
    }

    const customSignOptions = masOptions || this.platformSpecificBuildOptions
    const entitlementsSuffix = masOptions == null ? "mac" : "mas"
    if (customSignOptions.entitlements == null) {
      const p = `entitlements.${entitlementsSuffix}.plist`
      if (resourceList.includes(p)) {
        signOptions.entitlements = path.join(this.info.buildResourcesDir, p)
      }
    }
    else {
      signOptions.entitlements = customSignOptions.entitlements
    }

    if (customSignOptions.entitlementsInherit == null) {
      const p = `entitlements.${entitlementsSuffix}.inherit.plist`
      if (resourceList.includes(p)) {
        signOptions["entitlements-inherit"] = path.join(this.info.buildResourcesDir, p)
      }
    }
    else {
      signOptions["entitlements-inherit"] = customSignOptions.entitlementsInherit
    }

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
    await ensureDir(path.dirname(outFile))

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

    const extendInfo = this.platformSpecificBuildOptions.extendInfo
    if (extendInfo != null) {
      Object.assign(appPlist, extendInfo)
    }
  }
}

function getCertificateType(isMas: boolean, isDevelopment: boolean): CertType {
  if (isDevelopment) {
    return "Mac Developer"
  }
  return isMas ? "3rd Party Mac Developer Application" : "Developer ID Application"
}