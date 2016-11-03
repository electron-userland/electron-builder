import { PlatformPackager, BuildInfo, Target } from "./platformPackager"
import { Platform, Arch } from "./metadata"
import { MasBuildOptions, MacOptions } from "./options/macOptions"
import * as path from "path"
import BluebirdPromise from "bluebird-lst-c"
import { log, warn, task } from "./util/log"
import { createKeychain, CodeSigningInfo, findIdentity } from "./codeSign"
import { deepAssign } from "./util/deepAssign"
import { signAsync, flatAsync, BaseSignOptions, SignOptions, FlatOptions } from "electron-osx-sign-tf"
import { DmgTarget } from "./targets/dmg"
import { createCommonTarget, DEFAULT_TARGET } from "./targets/targetFactory"
import { AppInfo } from "./appInfo"

export default class MacPackager extends PlatformPackager<MacOptions> {
  codeSigningInfo: Promise<CodeSigningInfo>

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

  normalizePlatformSpecificBuildOptions(options: MacOptions | n): MacOptions {
    return super.normalizePlatformSpecificBuildOptions(options == null ? (<any>this.info.devMetadata.build).osx : options)
  }

  createTargets(targets: Array<string>, mapper: (name: string, factory: () => Target) => void, cleanupTasks: Array<() => Promise<any>>): void {
    for (let name of targets) {
      if (name === "dir") {
        continue
      }

      if (name === DEFAULT_TARGET) {
        mapper("dmg", () => new DmgTarget(this))
        mapper("zip", () => new Target("zip"))
      }
      else if (name === "dmg") {
        mapper("dmg", () => new DmgTarget(this))
      }
      else if (name === "pkg") {
        mapper(name, () => new Target(name))
      }
      else {
        mapper(name, () => name === "mas" ? new Target("mas") : createCommonTarget(name))
      }
    }
  }

  get platform() {
    return Platform.MAC
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    let nonMasPromise: Promise<any> | null = null

    const hasMas = targets.length !== 0 && targets.some(it => it.name === "mas")
    const hasPkg = targets.length !== 0 && targets.some(it => it.name === "pkg")

    if ((!hasMas && !hasPkg) || targets.length > 1) {
      const appOutDir = this.computeAppOutDir(outDir, arch)
      nonMasPromise = this.doPack(outDir, appOutDir, this.platform.nodeName, arch, this.platformSpecificBuildOptions)
        .then(() => this.sign(appOutDir, null, null))
        .then(() => {
          this.packageInDistributableFormat(appOutDir, targets, postAsyncTasks)
        })
    }

    if (hasMas) {
      // osx-sign - disable warning
      const appOutDir = path.join(outDir, "mas")
      const masBuildOptions = deepAssign({}, this.platformSpecificBuildOptions, (<any>this.devMetadata.build).mas)
      //noinspection JSUnusedGlobalSymbols
      await this.doPack(outDir, appOutDir, "mas", arch, masBuildOptions)
      await this.sign(appOutDir, masBuildOptions, "mas")
    }

    if (hasPkg) {
      // osx-sign - disable warning
      const appOutDir = path.join(outDir, "pkg")
      const masBuildOptions = deepAssign({}, this.platformSpecificBuildOptions, (<any>this.devMetadata.build).mas)
      //noinspection JSUnusedGlobalSymbols
      await
      this.doPack(outDir, appOutDir, "mas", arch, masBuildOptions)
      await
      this.sign(appOutDir, masBuildOptions, "pkg")
    }

    if (nonMasPromise != null) {
      await nonMasPromise
    }
  }

  private async sign(appOutDir: string, masOptions: MasBuildOptions | null, target: string | null): Promise<void> {
    if (process.platform !== "darwin") {
      warn("macOS application code signing is not supported on this platform, skipping.")
      return
    }

    let keychainName = (await this.codeSigningInfo).keychainName
    const isMas = masOptions != null
    const masQualifier = isMas ? (masOptions!!.identity || this.platformSpecificBuildOptions.identity) : null

    let name = await findIdentity(isMas ? "3rd Party Mac Developer Application" : "Developer ID Application", isMas ? masQualifier : this.platformSpecificBuildOptions.identity, keychainName)

    if (target === "pkg") {
      name = await findIdentity("Developer ID Application", isMas ? masQualifier : this.platformSpecificBuildOptions.identity, keychainName)
    }

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

    let installerName: string | null = null
    if (masOptions != null) {
      installerName = await findIdentity(target === "pkg" ? "Developer ID Installer" : "3rd Party Mac Developer Installer", masQualifier, keychainName)
      if (installerName == null) {
        throw new Error('Cannot find valid "3rd Party Mac Developer Installer" identity to sign MAS installer or "Developer ID Installer" to sign standalone installer, see https://github.com/electron-userland/electron-builder/wiki/Code-Signing')
      }
    }

    const baseSignOptions: BaseSignOptions = {
      app: path.join(appOutDir, `${this.appInfo.productFilename}.app`),
      platform: isMas ? "mas" : "darwin",
      keychain: keychainName || undefined,
      version: this.info.electronVersion
    }

    const signOptions = Object.assign({
      identity: name,
    }, (<any>this.devMetadata.build)["osx-sign"], baseSignOptions)

    const resourceList = await this.resourceList
    if (resourceList.includes(`entitlements.osx.plist`)) {
      throw new Error("entitlements.osx.plist is deprecated name, please use entitlements.mac.plist")
    }
    if (resourceList.includes(`entitlements.osx.inherit.plist`)) {
      throw new Error("entitlements.osx.inherit.plist is deprecated name, please use entitlements.mac.inherit.plist")
    }

    const customSignOptions = masOptions || this.platformSpecificBuildOptions
    if (customSignOptions.entitlements != null) {
      signOptions.entitlements = customSignOptions.entitlements
    }
    else {
      const p = `entitlements.${isMas ? "mas" : "mac"}.plist`
      if (resourceList.includes(p)) {
        signOptions.entitlements = path.join(this.buildResourcesDir, p)
      }
    }

    if (customSignOptions.entitlementsInherit != null) {
      signOptions["entitlements-inherit"] = customSignOptions.entitlementsInherit
    }
    else {
      const p = `entitlements.${isMas ? "mas" : "mac"}.inherit.plist`
      if (resourceList.includes(p)) {
        signOptions["entitlements-inherit"] = path.join(this.buildResourcesDir, p)
      }
    }

    await task(`Signing app (identity: ${name})`, this.doSign(signOptions))

    if (masOptions != null) {
      await task(`Signing app (identity: ${installerName})`, this.doSign(signOptions))
      const pkg = path.join(appOutDir, `${this.appInfo.productFilename}-${this.appInfo.version}.pkg`)
      await this.doFlat(Object.assign({
        pkg: pkg,
        identity: installerName,
      }, baseSignOptions))
      this.dispatchArtifactCreated(pkg, `${this.appInfo.name}-${this.appInfo.version}.pkg`)
    }
  }

  //noinspection JSMethodCanBeStatic
  protected async doSign(opts: SignOptions): Promise<any> {
    return signAsync(opts)
  }

  //noinspection JSMethodCanBeStatic
  protected async doFlat(opts: FlatOptions): Promise<any> {
    return flatAsync(opts)
  }

  protected packageInDistributableFormat(appOutDir: string, targets: Array<Target>, promises: Array<Promise<any>>): void {
    for (let t of targets) {
      const target = t.name
      if (t instanceof DmgTarget) {
        promises.push(t.build(appOutDir))
      }
      else if (target !== "mas") {
        log(`Creating MacOS ${target}`)
        // we use app name here - see https://github.com/electron-userland/electron-builder/pull/204
        const outFile = path.join(appOutDir, this.generateName2(target, "mac", false))
        promises.push(this.archiveApp(target, appOutDir, outFile)
          .then(() => this.dispatchArtifactCreated(outFile, this.generateName2(target, "mac", true))))
      }
    }
  }
}