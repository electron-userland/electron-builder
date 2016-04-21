import { PlatformPackager, BuildInfo } from "./platformPackager"
import { Platform, OsXBuildOptions } from "./metadata"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { log, spawn, statOrNull } from "./util"
import { createKeychain, deleteKeychain, CodeSigningInfo, generateKeychainName, sign } from "./codeSign"
import { path7za } from "7zip-bin"
import deepAssign = require("deep-assign")

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
      this.codeSigningInfo = createKeychain(keychainName, this.options.cscLink, this.options.cscKeyPassword, this.options.csaLink)
    }
    else {
      this.codeSigningInfo = BluebirdPromise.resolve(null)
    }

    let target = this.customBuildOptions == null ? null : this.customBuildOptions.target
    if (target != null) {
      target = Array.isArray(target) ? target : [target]
      target = target.map(it => it.toLowerCase().trim())
      for (let t of target) {
        if (t !== "default" && t !== "dmg" && t !== "zip") {
          throw new Error("Unknown target: " + t)
        }
      }
    }
    this.target = target == null ? ["default"] : target
  }

  get platform() {
    return Platform.OSX
  }

  async pack(outDir: string, appOutDir: string, arch: string): Promise<any> {
    await super.pack(outDir, appOutDir, arch)
    await this.signMac(path.join(appOutDir, this.appName + ".app"), await this.codeSigningInfo)
  }

  private signMac(distPath: string, codeSigningInfo: CodeSigningInfo): Promise<any> {
    if (codeSigningInfo == null) {
      codeSigningInfo = {cscName: this.options.sign || process.env.CSC_NAME}
    }

    if (codeSigningInfo.cscName == null) {
      log("App is not signed: CSC_LINK or CSC_NAME are not specified")
      return BluebirdPromise.resolve()
    }
    else {
      log("Signing app")
      return sign(distPath, codeSigningInfo)
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
        const emitter = require("appdmg")({
          target: artifactPath,
          basepath: this.projectDir,
          specification: await this.computeEffectiveDistOptions(appOutDir)
        })
        emitter.on("error", reject)
        emitter.on("finish", () => resolve())
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
    const args = ["a", "-mm=" + (this.devMetadata.build.compression === "store" ? "Copy" : "Deflate"), "-bb0", "-bd"]
    if (this.devMetadata.build.compression === "maximum") {
      // http://superuser.com/a/742034
      //noinspection SpellCheckingInspection
      args.push("-mfb=258", "-mpass=15")
    }
    args.push(resultPath, this.appName + ".app")

    return spawn(path7za, args, {
      cwd: outDir,
      stdio: ["ignore", "ignore", "inherit"],
    })
      .thenReturn(path.join(outDir, resultPath))
  }
}