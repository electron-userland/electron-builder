import BluebirdPromise from "bluebird-lst"
import { Arch, exec, isPullRequest, log, task, warn } from "electron-builder-util"
import { signAsync, SignOptions } from "electron-osx-sign"
import { ensureDir } from "fs-extra-p"
import * as path from "path"
import { deepAssign } from "read-config-file/out/deepAssign"
import { AppInfo } from "./appInfo"
import { appleCertificatePrefixes, CertType, CodeSigningInfo, createKeychain, findIdentity, Identity } from "./codeSign"
import { DIR_TARGET, Platform, Target } from "./core"
import { MacOptions, MasBuildOptions } from "./options/macOptions"
import { Packager } from "./packager"
import { PlatformPackager } from "./platformPackager"
import { DmgTarget } from "./targets/dmg/dmg"
import { PkgTarget, prepareProductBuildArgs } from "./targets/pkg"
import { createCommonTarget, NoOpTarget } from "./targets/targetFactory"
import { AsyncTaskManager } from "./util/asyncTaskManager"
import { isAutoDiscoveryCodeSignIdentity } from "./util/flags"

const buildForPrWarning = "There are serious security concerns with CSC_FOR_PULL_REQUEST=true (see the  CircleCI documentation (https://circleci.com/docs/1.0/fork-pr-builds/) for details)" +
  "\nIf you have SSH keys, sensitive env vars or AWS credentials stored in your project settings and untrusted forks can make pull requests against your repo, then this option isn't for you."

export default class MacPackager extends PlatformPackager<MacOptions> {
  readonly codeSigningInfo: Promise<CodeSigningInfo>

  constructor(info: Packager) {
    super(info)

    if (this.packagerOptions.cscLink == null || process.platform !== "darwin") {
      this.codeSigningInfo = BluebirdPromise.resolve(Object.create(null))
    }
    else {
      this.codeSigningInfo = createKeychain({
        tmpDir: info.tempDirManager,
        cscLink: this.packagerOptions.cscLink!,
        cscKeyPassword: this.getCscPassword(),
        cscILink: this.packagerOptions.cscInstallerLink,
        cscIKeyPassword: this.packagerOptions.cscInstallerKeyPassword,
        currentDir: this.projectDir
      })
    }
  }

  get defaultTarget(): Array<string> {
    return ["zip", "dmg"]
  }

  protected prepareAppInfo(appInfo: AppInfo): AppInfo {
    return new AppInfo(this.info, this.platformSpecificBuildOptions.bundleVersion)
  }

  async getIconPath(): Promise<string | null> {
    let iconPath = this.platformSpecificBuildOptions.icon || this.config.icon
    if (iconPath != null && !iconPath.endsWith(".icns")) {
      iconPath += ".icns"
    }
    return iconPath == null ? await this.getDefaultIcon("icns") : await this.getResource(iconPath)
  }

  createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void): void {
    for (const name of targets) {
      switch (name) {
        case DIR_TARGET:
          break

        case "dmg":
          mapper("dmg", outDir => new DmgTarget(this, outDir))
          break

        case "pkg":
          mapper("pkg", outDir => new PkgTarget(this, outDir))
          break

        default:
          mapper(name, outDir => name === "mas" || name === "mas-dev" ? new NoOpTarget(name) : createCommonTarget(name, outDir, this))
          break
      }
    }
  }

  get platform() {
    return Platform.MAC
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, taskManager: AsyncTaskManager): Promise<any> {
    let nonMasPromise: Promise<any> | null = null

    const hasMas = targets.length !== 0 && targets.some(it => it.name === "mas" || it.name === "mas-dev")
    const prepackaged = this.packagerOptions.prepackaged

    if (!hasMas || targets.length > 1) {
      const appPath = prepackaged == null ? path.join(this.computeAppOutDir(outDir, arch), `${this.appInfo.productFilename}.app`) : prepackaged
      nonMasPromise = (prepackaged ? BluebirdPromise.resolve() : this.doPack(outDir, path.dirname(appPath), this.platform.nodeName, arch, this.platformSpecificBuildOptions, targets))
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

  private async sign(appPath: string, outDir: string | null, masOptions: MasBuildOptions | null): Promise<void> {
    if (process.platform !== "darwin") {
      warn("macOS application code signing is supported only on macOS, skipping.")
      return
    }

    if (isPullRequest()) {
      if (process.env.CSC_FOR_PULL_REQUEST === "true") {
        warn(buildForPrWarning)
      }
      else {
        // https://github.com/electron-userland/electron-builder/issues/1524
        warn("Current build is a part of pull request, code signing will be skipped." +
          "\nSet env CSC_FOR_PULL_REQUEST to true to force code signing." +
          `\n${buildForPrWarning}`)
        return
      }
    }

    const isMas = masOptions != null
    const macOptions = this.platformSpecificBuildOptions
    const qualifier = (isMas ? masOptions!.identity : null) || macOptions.identity

    if (!isMas && qualifier === null) {
      if (this.forceCodeSigning) {
        throw new Error("identity explicitly is set to null, but forceCodeSigning is set to true")
      }
      log("identity explicitly is set to null, skipping macOS application code signing.")
      return
    }

    const keychainName = (await this.codeSigningInfo).keychainName
    const explicitType = isMas ? masOptions!.type : macOptions.type
    const type = explicitType || "distribution"
    const isDevelopment = type === "development"
    const certificateType = getCertificateType(isMas, isDevelopment)
    let identity = await findIdentity(certificateType, qualifier, keychainName)
    if (identity == null) {
      if (!isMas && !isDevelopment && explicitType !== "distribution") {
        identity = await findIdentity("Mac Developer", qualifier, keychainName)
        if (identity != null) {
          warn("Mac Developer is used to sign app — it is only for development and testing, not for production")
        }
      }

      if (identity == null) {
        await this.reportError(isMas, certificateType, qualifier, keychainName)
        return
      }
    }

    const signOptions: any = {
      "identity-validation": false,
      // https://github.com/electron-userland/electron-builder/issues/1699
      ignore: (file: string) => file.startsWith("/Contents/PlugIns", appPath.length),
      identity: identity!,
      type,
      platform: isMas ? "mas" : "darwin",
      version: this.config.electronVersion,
      app: appPath,
      keychain: keychainName || undefined,
      binaries:  (isMas && masOptions != null ? masOptions.binaries : macOptions.binaries) || undefined,
      requirements: isMas || macOptions.requirements == null ? undefined : await this.getResource(macOptions.requirements),
      "gatekeeper-assess": appleCertificatePrefixes.find(it => identity!.name.startsWith(it)) != null
    }

    await this.adjustSignOptions(signOptions, masOptions)
    await task(`Signing app (identity: ${identity.hash} ${identity.name})`, this.doSign(signOptions))

    // https://github.com/electron-userland/electron-builder/issues/1196#issuecomment-312310209
    if (masOptions != null && !isDevelopment) {
      const certType = isDevelopment ? "Mac Developer" : "3rd Party Mac Developer Installer"
      const masInstallerIdentity = await findIdentity(certType, masOptions.identity, keychainName)
      if (masInstallerIdentity == null) {
        throw new Error(`Cannot find valid "${certType}" identity to sign MAS installer, please see https://github.com/electron-userland/electron-builder/wiki/Code-Signing`)
      }

      const artifactName = this.expandArtifactNamePattern(masOptions, "pkg")
      const artifactPath = path.join(outDir!, artifactName)
      await this.doFlat(appPath, artifactPath, masInstallerIdentity, keychainName)
      this.dispatchArtifactCreated(artifactPath, null, Arch.x64, this.computeSafeArtifactName(artifactName, "pkg"))
    }
  }

  private async reportError(isMas: boolean, certificateType: CertType, qualifier: string | null | undefined, keychainName: string | null | undefined) {
    let message: string
    if (qualifier == null) {
      message = `App is not signed`
      if (isAutoDiscoveryCodeSignIdentity()) {
        const postfix = isMas ? "" : ` or custom non-Apple code signing certificate`
        message += `: cannot find valid "${certificateType}" identity${postfix}`
      }
      message += ", see https://github.com/electron-userland/electron-builder/wiki/Code-Signing"
      if (!isAutoDiscoveryCodeSignIdentity()) {
        message += `\n(CSC_IDENTITY_AUTO_DISCOVERY=false)`
      }
    }
    else {
      message = `Identity name "${qualifier}" is specified, but no valid identity with this name in the keychain`
    }

    const args = ["find-identity"]
    if (keychainName != null) {
      args.push(keychainName)
    }

    if (qualifier != null || isAutoDiscoveryCodeSignIdentity()) {
      const allIdentities = (await exec("security", args))
        .trim()
        .split("\n")
        .filter(it => !(it.includes("Policy: X.509 Basic") || it.includes("Matching identities")))
        .join("\n")
      message += "\n\nAll identities:\n" + allIdentities
    }

    if (isMas || this.forceCodeSigning) {
      throw new Error(message)
    }
    else {
      warn(message)
    }
  }

  private async adjustSignOptions(signOptions: any, masOptions: MasBuildOptions | null) {
    const resourceList = await this.resourceList
    if (resourceList.includes(`entitlements.osx.plist`)) {
      throw new Error("entitlements.osx.plist is deprecated name, please use entitlements.mac.plist")
    }
    if (resourceList.includes(`entitlements.osx.inherit.plist`)) {
      throw new Error("entitlements.osx.inherit.plist is deprecated name, please use entitlements.mac.inherit.plist")
    }

    const customSignOptions = masOptions || this.platformSpecificBuildOptions
    const entitlementsSuffix = masOptions == null ? "mac" : "mas"
    if (customSignOptions.entitlements == null) {
      const p = `entitlements.${entitlementsSuffix}.plist`
      if (resourceList.includes(p)) {
        signOptions.entitlements = path.join(this.buildResourcesDir, p)
      }
    }
    else {
      signOptions.entitlements = customSignOptions.entitlements
    }

    if (customSignOptions.entitlementsInherit == null) {
      const p = `entitlements.${entitlementsSuffix}.inherit.plist`
      if (resourceList.includes(p)) {
        signOptions["entitlements-inherit"] = path.join(this.buildResourcesDir, p)
      }
    }
    else {
      signOptions["entitlements-inherit"] = customSignOptions.entitlementsInherit
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
    return path.resolve(this.projectDir, dist, this.electronDistMacOsAppName)
  }

  public getElectronDestinationDir(appOutDir: string) {
    return path.join(appOutDir, this.electronDistMacOsAppName)
  }
}

function getCertificateType(isMas: boolean, isDevelopment: boolean): CertType {
  if (isDevelopment) {
    return "Mac Developer"
  }
  return isMas ? "3rd Party Mac Developer Application" : "Developer ID Application"
}