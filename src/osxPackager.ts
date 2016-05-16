import { PlatformPackager, BuildInfo, normalizeTargets } from "./platformPackager"
import { Platform, OsXBuildOptions, MasBuildOptions } from "./metadata"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { log, debug, debug7z, spawn, statOrNull, warn } from "./util"
import { createKeychain, deleteKeychain, CodeSigningInfo, generateKeychainName } from "./codeSign"
import { path7za } from "7zip-bin"
import deepAssign = require("deep-assign")
import { sign, flat, BaseSignOptions, SignOptions, FlatOptions } from "electron-osx-sign-tf"
import { readdir } from "fs-extra-p"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export default class OsXPackager extends PlatformPackager<OsXBuildOptions> {
  codeSigningInfo: Promise<CodeSigningInfo | null>

  readonly targets: Array<string>

  readonly resourceList: Promise<Array<string>>

  constructor(info: BuildInfo, cleanupTasks: Array<() => Promise<any>>) {
    super(info)

    if (this.options.cscLink != null && this.options.cscKeyPassword != null) {
      const keychainName = generateKeychainName()
      cleanupTasks.push(() => deleteKeychain(keychainName))
      this.codeSigningInfo = createKeychain(keychainName, this.options.cscLink, this.options.cscKeyPassword, this.options.cscInstallerLink, this.options.cscInstallerKeyPassword, this.options.csaLink)
    }
    else {
      this.codeSigningInfo = BluebirdPromise.resolve(null)
    }

    const targets = normalizeTargets(this.customBuildOptions.target)
    if (targets != null) {
      for (let target of targets) {
        if (target !== "default" && target !== "dmg" && target !== "zip" && target !== "mas" && target !== "7z") {
          throw new Error("Unknown target: " + target)
        }
      }
    }
    this.targets = targets == null ? ["default"] : targets

    this.resourceList = readdir(this.buildResourcesDir)
  }

  get platform() {
    return Platform.OSX
  }

  async pack(outDir: string, arch: string, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    const packOptions = this.computePackOptions(outDir, arch)
    let nonMasPromise: Promise<any> | null = null
    if (this.targets.length > 1 || this.targets[0] !== "mas") {
      const appOutDir = this.computeAppOutDir(outDir, arch)
      nonMasPromise = this.doPack(packOptions, outDir, appOutDir, arch, this.customBuildOptions)
        .then(() => this.sign(appOutDir, null))
        .then(() => postAsyncTasks.push(this.packageInDistributableFormat(outDir, appOutDir, arch)))
    }

    if (this.targets.includes("mas")) {
      // osx-sign - disable warning
      const appOutDir = path.join(outDir, `${this.appName}-mas-${arch}`)
      const masBuildOptions = deepAssign({}, this.customBuildOptions, (<any>this.devMetadata.build)["mas"])
      await this.doPack(Object.assign({}, packOptions, {platform: "mas", "osx-sign": false}), outDir, appOutDir, arch, masBuildOptions)
      await this.sign(appOutDir, masBuildOptions)
    }

    if (nonMasPromise != null) {
      await nonMasPromise
    }
  }

  private async sign(appOutDir: string, masOptions: MasBuildOptions | null): Promise<void> {
    let codeSigningInfo = await this.codeSigningInfo
    if (codeSigningInfo == null) {
      codeSigningInfo = {
        name: this.options.sign || process.env.CSC_NAME || this.customBuildOptions.identity,
        installerName: this.options.sign || process.env.CSC_INSTALLER_NAME || (masOptions == null ? null : masOptions.identity),
      }
    }

    const identity = codeSigningInfo.name
    if (<string | null>identity == null) {
      const message = "App is not signed: CSC_LINK or CSC_NAME are not specified, see https://github.com/electron-userland/electron-builder/wiki/Code-Signing"
      if (masOptions != null) {
        throw new Error(message)
      }
      warn(message)
      return
    }

    log(`Signing app (identity: ${identity})`)

    const baseSignOptions: BaseSignOptions = {
      app: path.join(appOutDir, this.appName + ".app"),
      platform: masOptions == null ? "darwin" : "mas"
    }
    if (codeSigningInfo.keychainName != null) {
      baseSignOptions.keychain = codeSigningInfo.keychainName
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
      const p = `${masOptions == null ? "osx" : "mas"}.entitlements`
      if (resourceList.includes(p)) {
        signOptions.entitlements = path.join(this.buildResourcesDir, p)
      }
    }

    if (customSignOptions.entitlementsInherit != null) {
      signOptions["entitlements-inherit"] = customSignOptions.entitlementsInherit
    }
    else {
      const p = `${masOptions == null ? "osx" : "mas"}.inherit.entitlements`
      if (resourceList.includes(p)) {
        signOptions["entitlements-inherit"] = path.join(this.buildResourcesDir, p)
      }
    }

    await this.doSign(signOptions)

    if (masOptions != null) {
      const installerIdentity = codeSigningInfo.installerName
      if (installerIdentity == null) {
        throw new Error("Signing is required for mas builds but CSC_INSTALLER_LINK or CSC_INSTALLER_NAME are not specified")
      }

      const pkg = path.join(appOutDir, `${this.appName}-${this.metadata.version}.pkg`)
      await this.doFlat(Object.assign({
        pkg: pkg,
        identity: installerIdentity,
      }, baseSignOptions))
      this.dispatchArtifactCreated(pkg, `${this.metadata.name}-${this.metadata.version}.pkg`)
    }
  }

  protected async doSign(opts: SignOptions): Promise<any> {
    return BluebirdPromise.promisify(sign)(opts)
  }

  protected async doFlat(opts: FlatOptions): Promise<any> {
    return BluebirdPromise.promisify(flat)(opts)
  }

  protected async computeEffectiveDistOptions(appOutDir: string): Promise<appdmg.Specification> {
    const specification: appdmg.Specification = deepAssign({
      title: this.appName,
      icon: path.join(this.buildResourcesDir, "icon.icns"),
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

    if (!("background" in this.customBuildOptions)) {
      const background = path.join(this.buildResourcesDir, "background.png")
      const info = await statOrNull(background)
      if (info != null && info.isFile()) {
        specification.background = background
      }
    }

    specification.contents[1].path = path.join(appOutDir, this.appName + ".app")
    return specification
  }

  packageInDistributableFormat(outDir: string, appOutDir: string, arch: string): Promise<any> {
    const promises: Array<Promise<any>> = []

    if (this.targets.includes("dmg") || this.targets.includes("default")) {
      const artifactPath = path.join(appOutDir, `${this.appName}-${this.metadata.version}.dmg`)
      promises.push(new BluebirdPromise<any>(async(resolve, reject) => {
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
        .then(() => this.dispatchArtifactCreated(artifactPath, `${this.metadata.name}-${this.metadata.version}.dmg`)))
    }

    for (let target of this.targets) {
      if (target !== "mas" && target !== "dmg") {
        const format = target === "default" ? "zip" : target!
        log("Creating OS X " + format)
        // for default we use mac to be compatible with Squirrel.Mac
        const classifier = target === "default" ? "mac" : "osx"
        promises.push(this.archiveApp(appOutDir, format, classifier)
          .then(it => this.dispatchArtifactCreated(it, `${this.metadata.name}-${this.metadata.version}-${classifier}.${format}`)))
      }
    }
    return BluebirdPromise.all(promises)
  }

  private archiveApp(outDir: string, format: string, classifier: string): Promise<string> {
    const args = ["a", "-bd"]
    if (debug7z.enabled) {
      args.push("-bb3")
    }
    else if (!debug.enabled) {
      args.push("-bb0")
    }

    const compression = this.devMetadata.build.compression
    const storeOnly = compression === "store"
    if (format === "zip" || storeOnly) {
      args.push("-mm=" + (storeOnly ? "Copy" : "Deflate"))
    }
    if (compression === "maximum") {
      // http://superuser.com/a/742034
      //noinspection SpellCheckingInspection
      if (format === "zip") {
        args.push("-mfb=258", "-mpass=15")
      }
      else if (format === "7z") {
        args.push("-m0=lzma2", "-mx=9", "-mfb=64", "-md=32m", "-ms=on")
      }
    }

    // we use app name here - see https://github.com/electron-userland/electron-builder/pull/204
    const resultPath = `${this.appName}-${this.metadata.version}-${classifier}.${format}`
    args.push(resultPath, this.appName + ".app")

    return spawn(path7za, args, {
      cwd: outDir,
      stdio: ["ignore", debug.enabled ? "inherit" : "ignore", "inherit"],
    })
      .thenReturn(path.join(outDir, resultPath))
  }
}