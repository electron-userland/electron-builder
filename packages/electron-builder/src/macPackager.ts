import BluebirdPromise from "bluebird-lst"
import { exec, isPullRequest, log, task, warn } from "electron-builder-util"
import { deepAssign } from "electron-builder-util/out/deepAssign"
import { signAsync, SignOptions } from "electron-osx-sign"
import { ensureDir } from "fs-extra-p"
import * as path from "path"
import { AppInfo } from "./appInfo"
import { appleCertificatePrefixes, CodeSigningInfo, createKeychain, findIdentity, Identity } from "./codeSign"
import { Arch, DIR_TARGET, Platform, Target } from "./core"
import { MacOptions, MasBuildOptions } from "./options/macOptions"
import { BuildInfo } from "./packagerApi"
import { PlatformPackager } from "./platformPackager"
import { DmgTarget } from "./targets/dmg"
import { PkgTarget, prepareProductBuildArgs } from "./targets/pkg"
import { createCommonTarget, NoOpTarget } from "./targets/targetFactory"
import { AsyncTaskManager } from "./util/asyncTaskManager"
import { isAutoDiscoveryCodeSignIdentity } from "./util/flags"

const buildForPrWarning = "There are serious security concerns with CSC_FOR_PULL_REQUEST=true (see the  CircleCI documentation (https://circleci.com/docs/1.0/fork-pr-builds/) for details)" +
  "\nIf you have SSH keys, sensitive env vars or AWS credentials stored in your project settings and untrusted forks can make pull requests against your repo, then this option isn't for you."

export default class MacPackager extends PlatformPackager<MacOptions> {
  readonly codeSigningInfo: Promise<CodeSigningInfo>

  constructor(info: BuildInfo) {
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

      const masBuildOptions = deepAssign({}, this.platformSpecificBuildOptions, (<any>this.config).mas)
      if (targetName === "mas-dev") {
        deepAssign(masBuildOptions, (<any>this.config)[targetName], {
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

    const keychainName = (await this.codeSigningInfo).keychainName
    const isMas = masOptions != null
    const macOptions = this.platformSpecificBuildOptions
    const qualifier = macOptions.identity

    if (!isMas && qualifier === null) {
      if (this.forceCodeSigning) {
        throw new Error("identity explicitly is set to null, but forceCodeSigning is set to true")
      }
      log("identity explicitly is set to null, skipping macOS application code signing.")
      return
    }

    const masQualifier = isMas ? (masOptions!!.identity || qualifier) : null

    const explicitType = masOptions == null ? macOptions.type : masOptions.type
    const type = explicitType || "distribution"
    const isDevelopment = type === "development"
    const certificateType = isMas ? "3rd Party Mac Developer Application" : "Developer ID Application"
    let identity = await findIdentity(isDevelopment ? "Mac Developer" : certificateType, isMas ? masQualifier : qualifier, keychainName)
    if (identity == null) {
      if (!isMas && !isDevelopment && explicitType !== "distribution") {
        identity = await findIdentity("Mac Developer", qualifier, keychainName)
        if (identity != null) {
          warn("Mac Developer is used to sign app — it is only for development and testing, not for production")
        }
        else if (qualifier != null) {
          throw new Error(`Identity name "${qualifier}" is specified, but no valid identity with this name in the keychain`)
        }
      }

      if (identity == null) {
        const postfix = isMas ? "" : ` or custom non-Apple code signing certificate`
        const message = isAutoDiscoveryCodeSignIdentity() ?
          `App is not signed: cannot find valid "${certificateType}" identity${postfix}, see https://github.com/electron-userland/electron-builder/wiki/Code-Signing` :
          `App is not signed: env CSC_IDENTITY_AUTO_DISCOVERY is set to false`
        if (isMas || this.forceCodeSigning) {
          throw new Error(message)
        }
        else {
          warn(message)
          return
        }
      }
    }

    const signOptions: any = {
      "identity-validation": false,
      // https://github.com/electron-userland/electron-builder/issues/1699
      ignore: (file: string) => file.startsWith("/Contents/PlugIns", appPath.length),
      identity: identity!,
      type: type,
      platform: isMas ? "mas" : "darwin",
      version: this.config.electronVersion,
      app: appPath,
      keychain: keychainName || undefined,
      binaries:  (isMas && masOptions != null ? masOptions.binaries : macOptions.binaries) || undefined,
      requirements: isMas || macOptions.requirements == null ? undefined : await this.getResource(macOptions.requirements),
      "gatekeeper-assess": appleCertificatePrefixes.find(it => identity!.name.startsWith(it)) != null
    }

    const resourceList = await this.resourceList
    if (resourceList.includes(`entitlements.osx.plist`)) {
      throw new Error("entitlements.osx.plist is deprecated name, please use entitlements.mac.plist")
    }
    if (resourceList.includes(`entitlements.osx.inherit.plist`)) {
      throw new Error("entitlements.osx.inherit.plist is deprecated name, please use entitlements.mac.inherit.plist")
    }

    const customSignOptions = masOptions || macOptions
    if (customSignOptions.entitlements == null) {
      const p = `entitlements.${isMas ? "mas" : "mac"}.plist`
      if (resourceList.includes(p)) {
        signOptions.entitlements = path.join(this.buildResourcesDir, p)
      }
    }
    else {
      signOptions.entitlements = customSignOptions.entitlements
    }

    if (customSignOptions.entitlementsInherit == null) {
      const p = `entitlements.${isMas ? "mas" : "mac"}.inherit.plist`
      if (resourceList.includes(p)) {
        signOptions["entitlements-inherit"] = path.join(this.buildResourcesDir, p)
      }
    }
    else {
      signOptions["entitlements-inherit"] = customSignOptions.entitlementsInherit
    }

    await task(`Signing app (identity: ${identity.hash} ${identity.name})`, this.doSign(signOptions))

    if (masOptions != null) {
      const certType = "3rd Party Mac Developer Installer"
      const masInstallerIdentity = await findIdentity(certType, masOptions.identity, keychainName)
      if (masInstallerIdentity == null) {
        throw new Error(`Cannot find valid "${certType}" identity to sign MAS installer, please see https://github.com/electron-userland/electron-builder/wiki/Code-Signing`)
      }

      const pkg = path.join(outDir!, this.expandArtifactNamePattern(masOptions, "pkg"))
      await this.doFlat(appPath, pkg, masInstallerIdentity, keychainName)
      this.dispatchArtifactCreated(pkg, null, Arch.x64, this.computeSafeArtifactName("pkg"))
    }
  }

  //noinspection JSMethodCanBeStatic
  protected async doSign(opts: SignOptions): Promise<any> {
    return signAsync(opts)
  }

  //noinspection JSMethodCanBeStatic
  protected async doFlat(appPath: string, outFile: string, identity: Identity, keychain: string | n): Promise<any> {
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
