import { PlatformPackager, BuildInfo, Target } from "./platformPackager"
import { Platform, Arch } from "./metadata"
import { MasBuildOptions, MacOptions } from "./options/macOptions"
import * as path from "path"
import BluebirdPromise from "bluebird-lst-c"
import { warn, task } from "./util/log"
import { createKeychain, CodeSigningInfo, findIdentity, appleCertificatePrefixes } from "./codeSign"
import { deepAssign } from "./util/deepAssign"
import { signAsync, SignOptions } from "electron-macos-sign"
import { DmgTarget } from "./targets/dmg"
import { createCommonTarget, DEFAULT_TARGET, DIR_TARGET, NoOpTarget } from "./targets/targetFactory"
import { AppInfo } from "./appInfo"
import { PkgTarget, prepareProductBuildArgs } from "./targets/pkg"
import { exec } from "./util/util"

export default class MacPackager extends PlatformPackager<MacOptions> {
  readonly codeSigningInfo: Promise<CodeSigningInfo>

  constructor(info: BuildInfo) {
    super(info)

    if (this.options.cscLink == null || process.platform !== "darwin") {
      this.codeSigningInfo = BluebirdPromise.resolve({})
    }
    else {
      this.codeSigningInfo = createKeychain(info.tempDirManager, this.options.cscLink!, this.getCscPassword(), this.options.cscInstallerLink, this.options.cscInstallerKeyPassword)
    }
  }

  protected prepareAppInfo(appInfo: AppInfo): AppInfo {
    return new AppInfo(appInfo.metadata, this.devMetadata, this.platformSpecificBuildOptions.bundleVersion)
  }

  async getIconPath(): Promise<string | null> {
    let iconPath = this.platformSpecificBuildOptions.icon || this.devMetadata.build.icon
    if (iconPath != null && !iconPath.endsWith(".icns")) {
      iconPath += ".icns"
    }
    return iconPath == null ? await this.getDefaultIcon("icns") : path.resolve(this.projectDir, iconPath)
  }

  createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void, cleanupTasks: Array<() => Promise<any>>): void {
    for (let name of targets) {
      switch (name) {
        case DIR_TARGET:
          break

        case DEFAULT_TARGET:
          mapper("dmg", () => new DmgTarget(this))
          mapper("zip", outDir => createCommonTarget("zip", outDir, this))
          break

        case "dmg":
          mapper("dmg", () => new DmgTarget(this))
          break

        case "pkg":
          mapper("pkg", () => new PkgTarget(this))
          break

        default:
          mapper(name, outDir => name === "mas" ? new NoOpTarget(name) : createCommonTarget(name, outDir, this))
          break
      }
    }
  }

  get platform() {
    return Platform.MAC
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    let nonMasPromise: Promise<any> | null = null

    const hasMas = targets.length !== 0 && targets.some(it => it.name === "mas")

    if (!hasMas || targets.length > 1) {
      const appOutDir = this.computeAppOutDir(outDir, arch)
      nonMasPromise = this.doPack(outDir, appOutDir, this.platform.nodeName, arch, this.platformSpecificBuildOptions)
        .then(() => this.sign(appOutDir, null))
        .then(() => this.packageInDistributableFormat(appOutDir, Arch.x64, targets, postAsyncTasks))
    }

    if (hasMas) {
      const appOutDir = path.join(outDir, "mas")
      const masBuildOptions = deepAssign({}, this.platformSpecificBuildOptions, (<any>this.devMetadata.build).mas)
      await this.doPack(outDir, appOutDir, "mas", arch, masBuildOptions)
      await this.sign(appOutDir, masBuildOptions)
    }

    if (nonMasPromise != null) {
      await nonMasPromise
    }
  }

  private async sign(appOutDir: string, masOptions: MasBuildOptions | null): Promise<void> {
    if (process.platform !== "darwin") {
      warn("macOS application code signing is supported only on macOS, skipping.")
      return
    }

    const keychainName = (await this.codeSigningInfo).keychainName
    const isMas = masOptions != null
    const masQualifier = isMas ? (masOptions!!.identity || this.platformSpecificBuildOptions.identity) : null

    let name = await findIdentity(isMas ? "3rd Party Mac Developer Application" : "Developer ID Application", isMas ? masQualifier : this.platformSpecificBuildOptions.identity, keychainName)
    if (name == null) {
      if (!isMas) {
        name = await findIdentity("Mac Developer", this.platformSpecificBuildOptions.identity, keychainName)
        if (name != null) {
          warn("Mac Developer is used to sign app — it is only for development and testing, not for production")
        }
      }

      if (name == null) {
        let message = `App is not signed: cannot find valid ${isMas ? '"3rd Party Mac Developer Application" identity' : `"Developer ID Application" identity or custom non-Apple code signing certificate`}, see https://github.com/electron-userland/electron-builder/wiki/Code-Signing`
        if (isMas) {
          throw new Error(message)
        }
        else {
          warn(message)
          return
        }
      }
    }

    const appPath = path.join(appOutDir, `${this.appInfo.productFilename}.app`)
    const signOptions: any = {
      identity: name!,
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
      const pkg = path.join(appOutDir, `${this.appInfo.productFilename}-${this.appInfo.version}.pkg`)
      await this.doFlat(appPath, pkg, await this.findInstallerIdentity(true, keychainName), keychainName)
      this.dispatchArtifactCreated(pkg, `${this.appInfo.name}-${this.appInfo.version}.pkg`)
    }
  }

  async findInstallerIdentity(isMas: boolean, keychainName: string | n): Promise<string> {
    const targetSpecificOptions: MacOptions = (<any>this.devMetadata.build)[isMas ? "mas" : "pkg"] || this.platformSpecificBuildOptions
    const name = isMas ? "3rd Party Mac Developer Installer" : "Developer ID Installer"
    let installerName = await findIdentity(name, targetSpecificOptions.identity, keychainName)
    if (installerName != null) {
      return installerName
    }

    if (isMas) {
      throw new Error(`Cannot find valid "${name}" identity to sign MAS installer, see https://github.com/electron-userland/electron-builder/wiki/Code-Signing`)
    }
    else {
      throw new Error(`Cannot find valid "${name}" to sign standalone installer, see https://github.com/electron-userland/electron-builder/wiki/Code-Signing`)
    }
  }

  //noinspection JSMethodCanBeStatic
  protected async doSign(opts: SignOptions): Promise<any> {
    return signAsync(opts)
  }

  //noinspection JSMethodCanBeStatic
  protected async doFlat(appPath: string, outFile: string, identity: string, keychain: string | n): Promise<any> {
    const args = prepareProductBuildArgs(appPath, identity, keychain)
    args.push(outFile)
    return exec("productbuild", args)
  }
}