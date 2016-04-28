import { PlatformPackager, BuildInfo } from "./platformPackager"
import { Platform, OsXBuildOptions } from "./metadata"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { log, debug, spawn, statOrNull } from "./util"
import { createKeychain, deleteKeychain, CodeSigningInfo, generateKeychainName } from "./codeSign"
import { path7za } from "7zip-bin"
import deepAssign = require("deep-assign")
import { sign, flat, BaseSignOptions } from "electron-osx-sign-tf"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export default class OsXPackager extends PlatformPackager<OsXBuildOptions> {
  codeSigningInfo: Promise<CodeSigningInfo>

  readonly target: Array<string>

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

    let target = this.customBuildOptions == null ? null : this.customBuildOptions.target
    if (target != null) {
      target = Array.isArray(target) ? target : [target]
      target = target.map(it => it.toLowerCase().trim())
      for (let t of target) {
        if (t !== "default" && t !== "dmg" && t !== "zip" && t !== "mas") {
          throw new Error("Unknown target: " + t)
        }
      }
    }
    this.target = target == null ? ["default"] : target
  }

  get platform() {
    return Platform.OSX
  }

  protected computeAppOutDir(outDir: string, arch: string): string {
    return this.target.includes("mas") ? path.join(outDir, `${this.appName}-mas-${arch}`) : super.computeAppOutDir(outDir, arch)
  }

  async doPack(outDir: string, appOutDir: string, arch: string): Promise<any> {
    await super.doPack(outDir, appOutDir, arch)
    await this.sign(appOutDir, await this.codeSigningInfo)
  }

  protected beforePack(options: any): void {
    if (this.target.includes("mas")) {
      options.platform = "mas"
    }
    // disable warning
    options["osx-sign"] = false
  }

  private async sign(appOutDir: string, codeSigningInfo: CodeSigningInfo): Promise<any> {
    if (codeSigningInfo == null) {
      codeSigningInfo = {
        name: this.options.sign || process.env.CSC_NAME,
        installerName: this.options.sign || process.env.CSC_INSTALLER_NAME,
      }
    }

    if (codeSigningInfo.name == null) {
      log("App is not signed: CSC_LINK or CSC_NAME are not specified")
      return
    }

    log("Signing app")

    const isMas = this.target.includes("mas")
    const baseSignOptions: BaseSignOptions = {
      app: path.join(appOutDir, this.appName + ".app"),
      platform: isMas ? "mas" : "darwin"
    }
    if (codeSigningInfo.keychainName != null) {
      baseSignOptions.keychain = codeSigningInfo.keychainName
    }

    await BluebirdPromise.promisify(sign)(Object.assign({
      identity: codeSigningInfo.name,
    }, (<any>this.devMetadata.build)["osx-sign"], baseSignOptions))

    if (isMas) {
      const installerIdentity = codeSigningInfo.installerName
      if (installerIdentity == null) {
        throw new Error("Signing is required for mas builds but CSC_INSTALLER_LINK or CSC_INSTALLER_NAME are not specified")
      }

      const pkg = path.join(appOutDir, `${this.appName}-${this.metadata.version}.pkg`)
      await BluebirdPromise.promisify(flat)(Object.assign({
        pkg: pkg,
        identity: installerIdentity,
      }, baseSignOptions))
      this.dispatchArtifactCreated(pkg, `${this.metadata.name}-${this.metadata.version}.pkg`)
    }
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
      ]
    }, this.customBuildOptions)

    if (this.customBuildOptions == null || !("background" in this.customBuildOptions)) {
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
    const artifactPath = path.join(appOutDir, `${this.appName}-${this.metadata.version}.dmg`)
    const promises: Array<Promise<any>> = []

    if (this.target.includes("dmg") || this.target.includes("default")) {
      promises.push(new BluebirdPromise<any>(async(resolve, reject) => {
        log("Creating DMG")
        const dmgOptions = {
          target: artifactPath,
          basepath: this.projectDir,
          specification: await this.computeEffectiveDistOptions(appOutDir),
          compression: this.devMetadata.build.compression === "store" ? "NONE" : "UDBZ"
        }

        if (debug.enabled) {
          debug(`appdmg: ${JSON.stringify(dmgOptions, null, 2)}`)
        }

        const emitter = require("appdmg-tf")(dmgOptions)
        emitter.on("error", (e: Error) => {
          console.error(e)
          reject(e)
        })
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

    if (this.target.includes("zip") || this.target.includes("default")) {
      promises.push(this.zipMacApp(appOutDir)
        .then(it => this.dispatchArtifactCreated(it, `${this.metadata.name}-${this.metadata.version}-mac.zip`)))
    }

    return BluebirdPromise.all(promises)
  }

  private zipMacApp(outDir: string): Promise<string> {
    log("Creating ZIP for Squirrel.Mac")
    // we use app name here - see https://github.com/electron-userland/electron-builder/pull/204
    const resultPath = `${this.appName}-${this.metadata.version}-mac.zip`
    const args = ["a", "-mm=" + (this.devMetadata.build.compression === "store" ? "Copy" : "Deflate"), "-bb" + (debug.enabled ? "3" : "0"), "-bd"]
    if (this.devMetadata.build.compression === "maximum") {
      // http://superuser.com/a/742034
      //noinspection SpellCheckingInspection
      args.push("-mfb=258", "-mpass=15")
    }
    args.push(resultPath, this.appName + ".app")

    return spawn(path7za, args, {
      cwd: outDir,
      stdio: ["ignore", debug.enabled ? "inherit" : "ignore", "inherit"],
    })
      .thenReturn(path.join(outDir, resultPath))
  }
}