import BluebirdPromise from "bluebird-lst"
import { Arch, DIR_TARGET, Platform, Target } from "electron-builder-core"
import { exec } from "electron-builder-util"
import { deepAssign } from "electron-builder-util/out/deepAssign"
import { log, task, warn } from "electron-builder-util/out/log"
import { signAsync, SignOptions } from "electron-macos-sign"
import { ensureDir } from "fs-extra-p"
import * as path from "path"
import { AppInfo } from "./appInfo"
import { appleCertificatePrefixes, CodeSigningInfo, createKeychain, findIdentity } from "./codeSign"
import { MacOptions, MasBuildOptions } from "./options/macOptions"
import { BuildInfo } from "./packagerApi"
import { PlatformPackager } from "./platformPackager"
import { DmgTarget } from "./targets/dmg"
import { PkgTarget, prepareProductBuildArgs } from "./targets/pkg"
import { createCommonTarget, NoOpTarget } from "./targets/targetFactory"

export default class MacPackager extends PlatformPackager<MacOptions> {
  readonly codeSigningInfo: Promise<CodeSigningInfo>

  constructor(info: BuildInfo) {
    super(info)

    if (this.packagerOptions.cscLink == null || process.platform !== "darwin") {
      this.codeSigningInfo = BluebirdPromise.resolve(Object.create(null))
    }
    else {
      this.codeSigningInfo = createKeychain(info.tempDirManager, this.packagerOptions.cscLink!, this.getCscPassword(), this.packagerOptions.cscInstallerLink, this.packagerOptions.cscInstallerKeyPassword)
    }
  }

  get defaultTarget(): Array<string> {
    return ["zip", "dmg"]
  }

  protected prepareAppInfo(appInfo: AppInfo): AppInfo {
    return new AppInfo(appInfo.metadata, this.info, this.platformSpecificBuildOptions.bundleVersion)
  }

  async getIconPath(): Promise<string | null> {
    let iconPath = this.platformSpecificBuildOptions.icon || this.config.icon
    if (iconPath != null && !iconPath.endsWith(".icns")) {
      iconPath += ".icns"
    }
    return iconPath == null ? await this.getDefaultIcon("icns") : await this.getResource(iconPath)
  }

  createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void, cleanupTasks: Array<() => Promise<any>>): void {
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
          mapper(name, outDir => name === "mas" || name === "mas-dev" ? new NoOpTarget(name) : createCommonTarget(name, path.join(outDir, "mac"), this))
          break
      }
    }
  }

  get platform() {
    return Platform.MAC
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    let nonMasPromise: Promise<any> | null = null

    const hasMas = targets.length !== 0 && targets.some(it => it.name === "mas" || it.name === "mas-dev")
    const prepackaged = this.info.prepackaged

    if (!hasMas || targets.length > 1) {
      const appPath = prepackaged == null ? path.join(this.computeAppOutDir(outDir, arch), `${this.appInfo.productFilename}.app`) : prepackaged
      nonMasPromise = (prepackaged ? BluebirdPromise.resolve() : this.doPack(outDir, path.dirname(appPath), this.platform.nodeName, arch, this.platformSpecificBuildOptions, targets))
        .then(() => this.sign(appPath, null, null))
        .then(() => this.packageInDistributableFormat(appPath, Arch.x64, targets, postAsyncTasks))
    }

    for (const target of targets) {
      const targetName = target.name
      if (!(targetName === "mas" || targetName === "mas-dev")) {
        continue
      }

      const masBuildOptions = deepAssign({}, this.platformSpecificBuildOptions, (<any>this.config).mas)
      if (targetName === "mas-dev") {
        deepAssign(masBuildOptions, (<any>this.config)[targetName])
        masBuildOptions.type = "development"
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

    const keychainName = (await this.codeSigningInfo).keychainName
    const isMas = masOptions != null
    const qualifier = this.platformSpecificBuildOptions.identity

    if (!isMas && qualifier === null) {
      if (this.forceCodeSigning) {
        throw new Error("identity explicitly is set to null, but forceCodeSigning is set to true")
      }
      log("identity explicitly is set to null, skipping macOS application code signing.")
      return
    }

    const masQualifier = isMas ? (masOptions!!.identity || qualifier) : null

    const explicitType = masOptions == null ? this.platformSpecificBuildOptions.type : masOptions.type
    const type = explicitType || "distribution"
    const isDevelopment = type === "development"
    let name = await findIdentity(isDevelopment ? "Mac Developer" : (isMas ? "3rd Party Mac Developer Application" : "Developer ID Application"), isMas ? masQualifier : qualifier, keychainName)
    if (name == null) {
      if (!isMas && !isDevelopment && explicitType !== "distribution") {
        name = await findIdentity("Mac Developer", qualifier, keychainName)
        if (name != null) {
          warn("Mac Developer is used to sign app — it is only for development and testing, not for production")
        }
        else if (qualifier != null) {
          throw new Error(`Identity name "${qualifier}" is specified, but no valid identity with this name in the keychain`)
        }
      }

      if (name == null) {
        const message = process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false" ?
          `App is not signed: env CSC_IDENTITY_AUTO_DISCOVERY is set to false` :
          `App is not signed: cannot find valid ${isMas ? '"3rd Party Mac Developer Application" identity' : `"Developer ID Application" identity or custom non-Apple code signing certificate`}, see https://github.com/electron-userland/electron-builder/wiki/Code-Signing`
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
      skipIdentityValidation: true,
      identity: name!,
      type: type,
      platform: isMas ? "mas" : "darwin",
      version: this.info.electronVersion,
      app: appPath,
      keychain: keychainName || undefined,
      "gatekeeper-assess": appleCertificatePrefixes.find(it => name!.startsWith(it)) != null
    }

    const resourceList = await this.resourceList
    if (resourceList.includes(`entitlements.osx.plist`)) {
      throw new Error("entitlements.osx.plist is deprecated name, please use entitlements.mac.plist")
    }
    if (resourceList.includes(`entitlements.osx.inherit.plist`)) {
      throw new Error("entitlements.osx.inherit.plist is deprecated name, please use entitlements.mac.inherit.plist")
    }

    const customSignOptions = masOptions || this.platformSpecificBuildOptions
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

    await task(`Signing app (identity: ${name})`, this.doSign(signOptions))

    if (masOptions != null) {
      const certType = "3rd Party Mac Developer Installer"
      const masInstallerIdentity = await findIdentity(certType, masOptions.identity, keychainName)
      if (masInstallerIdentity == null) {
        throw new Error(`Cannot find valid "${certType}" identity to sign MAS installer, please see https://github.com/electron-userland/electron-builder/wiki/Code-Signing`)
      }

      const pkg = path.join(outDir!, this.expandArtifactNamePattern(masOptions, "pkg"))
      await this.doFlat(appPath, pkg, masInstallerIdentity, keychainName)
      this.dispatchArtifactCreated(pkg, null, `${this.appInfo.name}-${this.appInfo.version}.pkg`)
    }
  }

  //noinspection JSMethodCanBeStatic
  protected async doSign(opts: SignOptions): Promise<any> {
    return signAsync(opts)
  }

  //noinspection JSMethodCanBeStatic
  protected async doFlat(appPath: string, outFile: string, identity: string, keychain: string | n): Promise<any> {
    // productbuild doesn't created directory for out file
    await ensureDir(path.dirname(outFile))

    const args = prepareProductBuildArgs(identity, keychain)
    args.push("--component", appPath, "/Applications")
    args.push(outFile)
    return await exec("productbuild", args)
  }
}