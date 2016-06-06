import { PlatformPackager, BuildInfo } from "./platformPackager"
import { Platform, OsXBuildOptions, MasBuildOptions, Arch } from "./metadata"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { log, debug, warn, isEmptyOrSpaces } from "./util"
import { createKeychain, deleteKeychain, CodeSigningInfo, generateKeychainName, findIdentity, appleCertificatePrefixes, CertType } from "./codeSign"
import deepAssign = require("deep-assign")
import { signAsync, flatAsync, BaseSignOptions, SignOptions, FlatOptions } from "electron-osx-sign-tf"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export default class OsXPackager extends PlatformPackager<OsXBuildOptions> {
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

  get platform() {
    return Platform.OSX
  }

  protected get supportedTargets(): Array<string> {
    return ["dmg", "mas"]
  }

  async pack(outDir: string, arch: Arch, targets: Array<string>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    const packOptions = this.computePackOptions(outDir, this.computeAppOutDir(outDir, arch), arch)
    let nonMasPromise: Promise<any> | null = null
    if (targets.length > 1 || targets[0] !== "mas") {
      const appOutDir = this.computeAppOutDir(outDir, arch)
      nonMasPromise = this.doPack(packOptions, outDir, appOutDir, arch, this.customBuildOptions)
        .then(() => this.sign(appOutDir, null))
        .then(() => {
          postAsyncTasks.push(this.packageInDistributableFormat(outDir, appOutDir, targets))
        })
    }

    if (targets.includes("mas")) {
      // osx-sign - disable warning
      const appOutDir = path.join(outDir, "mas")
      const masBuildOptions = deepAssign({}, this.customBuildOptions, (<any>this.devMetadata.build)["mas"])
      await this.doPack(Object.assign({}, packOptions, {platform: "mas", "osx-sign": false, generateFinalBasename: function () { return "mas" }}), outDir, appOutDir, arch, masBuildOptions)
      await this.sign(appOutDir, masBuildOptions)
    }

    if (nonMasPromise != null) {
      await nonMasPromise
    }
  }

  private static async findIdentity(certType: CertType, name?: string | null): Promise<string | null> {
    let identity = process.env.CSC_NAME || name
    if (isEmptyOrSpaces(identity)) {
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

      const identity = await OsXPackager.findIdentity(masOptions == null ? "Developer ID Application" : "3rd Party Mac Developer Application", this.customBuildOptions.identity)
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
        const installerName = masOptions == null ? null : (await OsXPackager.findIdentity("3rd Party Mac Developer Installer", this.customBuildOptions.identity))
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
    log(`Signing app (identity: ${identity})`)

    const baseSignOptions: BaseSignOptions = {
      app: path.join(appOutDir, `${this.appName}.app`),
      platform: masOptions == null ? "darwin" : "mas",
      keychain: <any>codeSigningInfo.keychainName,
      version: this.info.electronVersion
    }

    const signOptions = Object.assign({
      identity: identity,
    }, (<any>this.devMetadata.build)["osx-sign"], baseSignOptions)

    const resourceList = await this.resourceList

    const customSignOptions = masOptions || this.customBuildOptions
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

    await this.doSign(signOptions)

    if (masOptions != null) {
      const pkg = path.join(appOutDir, `${this.appName}-${this.metadata.version}.pkg`)
      await this.doFlat(Object.assign({
        pkg: pkg,
        identity: codeSigningInfo.installerName,
      }, baseSignOptions))
      this.dispatchArtifactCreated(pkg, `${this.metadata.name}-${this.metadata.version}.pkg`)
    }
  }

  protected async doSign(opts: SignOptions): Promise<any> {
    return signAsync(opts)
  }

  protected async doFlat(opts: FlatOptions): Promise<any> {
    return flatAsync(opts)
  }

  protected async computeEffectiveDistOptions(appOutDir: string): Promise<appdmg.Specification> {
    const specification: appdmg.Specification = deepAssign({
      title: this.appName,
      "icon-size": 80,
      contents: [
        {
          "x": 410, "y": 220, "type": "link", "path": "/Applications"
        },
        {
          "x": 130, "y": 220, "type": "file"
        }
      ],
      format: this.devMetadata.build.compression === "store" ? "UDRO" : "UDBZ",
    }, this.customBuildOptions)

    if (!("icon" in this.customBuildOptions)) {
      const resourceList = await this.resourceList
      if (resourceList.includes("icon.icns")) {
        specification.icon = path.join(this.buildResourcesDir, "icon.icns")
      }
      else {
        warn("Application icon is not set, default Electron icon will be used")
      }
    }

    if (!("background" in this.customBuildOptions)) {
      const resourceList = await this.resourceList
      if (resourceList.includes("background.png")) {
        specification.background = path.join(this.buildResourcesDir, "background.png")
      }
    }

    specification.contents[1].path = path.join(appOutDir, this.appName + ".app")
    return specification
  }

  protected packageInDistributableFormat(outDir: string, appOutDir: string, targets: Array<string>): Promise<any> {
    const promises: Array<Promise<any>> = []
    for (let target of targets) {
      if (target === "dmg" || target === "default") {
        promises.push(this.createDmg(appOutDir))
      }

      if (target !== "mas" && target !== "dmg") {
        const format = target === "default" ? "zip" : target
        log(`Creating OS X ${format}`)
        // for default we use mac to be compatible with Squirrel.Mac
        const classifier = target === "default" ? "mac" : "osx"
        // we use app name here - see https://github.com/electron-userland/electron-builder/pull/204
        const outFile = path.join(appOutDir, `${this.appName}-${this.metadata.version}-${classifier}.${format}`)
        promises.push(this.archiveApp(format, appOutDir, outFile)
          .then(() => this.dispatchArtifactCreated(outFile, `${this.metadata.name}-${this.metadata.version}-${classifier}.${format}`)))
      }
    }
    return BluebirdPromise.all(promises)
  }

  private async createDmg(appOutDir: string) {
    const artifactPath = path.join(appOutDir, `${this.appName}-${this.metadata.version}.dmg`)
    await new BluebirdPromise<any>(async(resolve, reject) => {
      log("Creating DMG")
      const dmgOptions = {
        target: artifactPath,
        basepath: this.projectDir,
        specification: await this.computeEffectiveDistOptions(appOutDir),
      }

      if (debug.enabled) {
        debug(`appdmg: ${JSON.stringify(dmgOptions, <any>null, 2)}`)
      }

      const emitter = require("appdmg")(dmgOptions)
      emitter.on("error", reject)
      emitter.on("finish", () => resolve())
      if (debug.enabled) {
        emitter.on("progress", (info: any) => {
          if (info.type === "step-begin") {
            debug(`appdmg: [${info.current}] ${info.title}`)
          }
        })
      }
    })

    this.dispatchArtifactCreated(artifactPath, `${this.metadata.name}-${this.metadata.version}.dmg`)
  }
}

function checkPrefix(name: string, prefix: string) {
  if (name.startsWith(prefix)) {
    throw new Error(`Please remove prefix "${prefix}" from the specified name — appropriate certificate will be chosen automatically`)
  }
}