import { PlatformPackager, BuildInfo, Target } from "./platformPackager"
import { Platform, MasBuildOptions, Arch, MacOptions } from "./metadata"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { log, warn, task } from "./util/log"
import { createKeychain, CodeSigningInfo, findIdentity } from "./codeSign"
import { deepAssign } from "./util/deepAssign"
import { signAsync, flatAsync, BaseSignOptions, SignOptions, FlatOptions } from "electron-osx-sign"
import { DmgTarget } from "./targets/dmg"
import { createCommonTarget, DEFAULT_TARGET } from "./targets/targetFactory"
import { AppInfo } from "./appInfo"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./util/awaiter")

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

    if (!hasMas || targets.length > 1) {
      const appOutDir = this.computeAppOutDir(outDir, arch)
      nonMasPromise = this.doPack(outDir, appOutDir, this.platform.nodeName, arch, this.platformSpecificBuildOptions)
        .then(() => this.sign(appOutDir, null))
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
      await this.sign(appOutDir, masBuildOptions)
    }

    if (nonMasPromise != null) {
      await nonMasPromise
    }
  }

  private async sign(appOutDir: string, masOptions: MasBuildOptions | null): Promise<void> {
    if (process.platform !== "darwin") {
      return
    }

    let keychainName = (await this.codeSigningInfo).keychainName
    const masQualifier = masOptions == null ? null : (masOptions.identity || this.platformSpecificBuildOptions.identity)

    let name = await findIdentity(masOptions == null ? "Developer ID Application" : "3rd Party Mac Developer Application", masOptions == null ? this.platformSpecificBuildOptions.identity : masQualifier, keychainName)
    if (name == null) {
      const message = "App is not signed: CSC_LINK is not specified, and no valid identity in the keychain, see https://github.com/electron-userland/electron-builder/wiki/Code-Signing"
      if (masOptions == null) {
        warn(message)
        return
      }
      else {
        throw new Error(message)
      }
    }

    let installerName: string | null = null
    if (masOptions != null) {
      installerName = await findIdentity("3rd Party Mac Developer Installer", masQualifier, keychainName)
      if (installerName == null) {
        throw new Error("Cannot find valid installer certificate: CSC_LINK is not specified, and no valid identity in the keychain, see https://github.com/electron-userland/electron-builder/wiki/Code-Signing")
      }
    }

    const baseSignOptions: BaseSignOptions = {
      app: path.join(appOutDir, `${this.appInfo.productFilename}.app`),
      platform: masOptions == null ? "darwin" : "mas",
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
      const p = `entitlements.${masOptions == null ? "mac" : "mas"}.plist`
      if (resourceList.includes(p)) {
        signOptions.entitlements = path.join(this.buildResourcesDir, p)
      }
    }

    if (customSignOptions.entitlementsInherit != null) {
      signOptions["entitlements-inherit"] = customSignOptions.entitlementsInherit
    }
    else {
      const p = `entitlements.${masOptions == null ? "mac" : "mas"}.inherit.plist`
      if (resourceList.includes(p)) {
        signOptions["entitlements-inherit"] = path.join(this.buildResourcesDir, p)
      }
    }

    await task(`Signing app (identity: ${name})`, this.doSign(signOptions))

    if (masOptions != null) {
      await task(`Signing app (identity: ${name})`, this.doSign(signOptions))
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