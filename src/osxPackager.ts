import { PlatformPackager, BuildInfo, Target } from "./platformPackager"
import { Platform, MasBuildOptions, Arch, MacOptions } from "./metadata"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { isEmptyOrSpaces } from "./util"
import { log, warn, task } from "./log"
import { createKeychain, deleteKeychain, CodeSigningInfo, generateKeychainName, findIdentity, appleCertificatePrefixes, CertType } from "./codeSign"
import deepAssign = require("deep-assign")
import { signAsync, flatAsync, BaseSignOptions, SignOptions, FlatOptions } from "electron-osx-sign-tf"
import { DmgTarget } from "./targets/dmg"
import { createCommonTarget, DEFAULT_TARGET } from "./targets/targetFactory"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export default class MacPackager extends PlatformPackager<MacOptions> {
  codeSigningInfo: Promise<CodeSigningInfo | null>

  constructor(info: BuildInfo, cleanupTasks: Array<() => Promise<any>>) {
    super(info)

    if (this.options.cscLink == null) {
      this.codeSigningInfo = BluebirdPromise.resolve(null)
    }
    else {
      const keychainName = generateKeychainName()
      cleanupTasks.push(() => deleteKeychain(keychainName))
      this.codeSigningInfo = createKeychain(keychainName, this.options.cscLink, this.getCscPassword(), this.options.cscInstallerLink, this.options.cscInstallerKeyPassword)
    }
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
    const packOptions = await this.computePackOptions(outDir, this.computeAppOutDir(outDir, arch), arch)
    let nonMasPromise: Promise<any> | null = null

    const hasMas = targets.length !== 0 && targets.some(it => it.name === "mas")

    if (!hasMas || targets.length > 1) {
      const appOutDir = this.computeAppOutDir(outDir, arch)
      nonMasPromise = this.doPack(packOptions, outDir, appOutDir, arch, this.platformSpecificBuildOptions)
        .then(() => this.sign(appOutDir, null))
        .then(() => {
          this.packageInDistributableFormat(appOutDir, targets, postAsyncTasks)
        })
    }

    if (hasMas) {
      // osx-sign - disable warning
      const appOutDir = path.join(outDir, "mas")
      const masBuildOptions = deepAssign({}, this.platformSpecificBuildOptions, (<any>this.devMetadata.build)["mas"])
      //noinspection JSUnusedGlobalSymbols
      await this.doPack(Object.assign({}, packOptions, {
        platform: "mas",
        "osx-sign": false,
        generateFinalBasename: function () { return "mas" }
      }), outDir, appOutDir, arch, masBuildOptions)
      await this.sign(appOutDir, masBuildOptions)
    }

    if (nonMasPromise != null) {
      await nonMasPromise
    }
  }

  private static async findIdentity(certType: CertType, name?: string | null): Promise<string | null> {
    let identity = process.env.CSC_NAME || name
    if (isEmptyOrSpaces(identity)) {
      if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false") {
        return null
      }
      return await findIdentity(certType)
    }
    else {
      identity = identity.trim()
      for (let prefix of appleCertificatePrefixes) {
        checkPrefix(identity, prefix)
      }
      const result = await findIdentity(certType, identity)
      if (result == null) {
        throw new Error(`Identity name "${identity}" is specified, but no valid identity with this name in the keychain`)
      }
      return result
    }
  }

  private async sign(appOutDir: string, masOptions: MasBuildOptions | null): Promise<void> {
    let codeSigningInfo = await this.codeSigningInfo
    if (codeSigningInfo == null) {
      if (process.env.CSC_LINK != null) {
        throw new Error("codeSigningInfo is null, but CSC_LINK defined")
      }

      const identity = await MacPackager.findIdentity(masOptions == null ? "Developer ID Application" : "3rd Party Mac Developer Application", this.platformSpecificBuildOptions.identity)
      if (identity == null) {
        const message = "App is not signed: CSC_LINK or CSC_NAME are not specified, and no valid identity in the keychain, see https://github.com/electron-userland/electron-builder/wiki/Code-Signing"
        if (masOptions == null) {
          warn(message)
          return
        }
        else {
          throw new Error(message)
        }
      }

      if (masOptions != null) {
        const installerName = masOptions == null ? null : (await MacPackager.findIdentity("3rd Party Mac Developer Installer", this.platformSpecificBuildOptions.identity))
        if (installerName == null) {
          throw new Error("Cannot find valid installer certificate: CSC_LINK or CSC_NAME are not specified, and no valid identity in the keychain, see https://github.com/electron-userland/electron-builder/wiki/Code-Signing")
        }

        codeSigningInfo = {
          name: identity,
          installerName: installerName,
        }
      }
      else {
        codeSigningInfo = {
          name: identity,
        }
      }
    }
    else {
      if (codeSigningInfo.name == null && masOptions == null) {
        throw new Error("codeSigningInfo.name is null, but CSC_LINK defined")
      }
      if (masOptions != null && codeSigningInfo.installerName == null) {
        throw new Error("Signing is required for mas builds but CSC_INSTALLER_LINK is not specified")
      }
    }

    const identity = codeSigningInfo.name

    const baseSignOptions: BaseSignOptions = {
      app: path.join(appOutDir, `${this.appInfo.productName}.app`),
      platform: masOptions == null ? "darwin" : "mas",
      keychain: <any>codeSigningInfo.keychainName,
      version: this.info.electronVersion
    }

    const signOptions = Object.assign({
      identity: identity,
    }, (<any>this.devMetadata.build)["osx-sign"], baseSignOptions)

    const resourceList = await this.resourceList

    const customSignOptions = masOptions || this.platformSpecificBuildOptions
    if (customSignOptions.entitlements != null) {
      signOptions.entitlements = customSignOptions.entitlements
    }
    else {
      const p = `entitlements.${masOptions == null ? "osx" : "mas"}.plist`
      if (resourceList.includes(p)) {
        signOptions.entitlements = path.join(this.buildResourcesDir, p)
      }
    }

    if (customSignOptions.entitlementsInherit != null) {
      signOptions["entitlements-inherit"] = customSignOptions.entitlementsInherit
    }
    else {
      const p = `entitlements.${masOptions == null ? "osx" : "mas"}.inherit.plist`
      if (resourceList.includes(p)) {
        signOptions["entitlements-inherit"] = path.join(this.buildResourcesDir, p)
      }
    }

    await task(`Signing app (identity: ${identity})`, this.doSign(signOptions))

    if (masOptions != null) {
      const pkg = path.join(appOutDir, `${this.appInfo.productName}-${this.appInfo.version}.pkg`)
      await this.doFlat(Object.assign({
        pkg: pkg,
        identity: codeSigningInfo.installerName,
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

function checkPrefix(name: string, prefix: string) {
  if (name.startsWith(prefix)) {
    throw new Error(`Please remove prefix "${prefix}" from the specified name — appropriate certificate will be chosen automatically`)
  }
}