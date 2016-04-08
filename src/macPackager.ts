import { PlatformPackager, BuildInfo } from "./platformPackager"
import { Platform, OsXBuildOptions } from "./metadata"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { log, spawn } from "./util"
import { createKeychain, deleteKeychain, CodeSigningInfo, generateKeychainName, sign } from "./codeSign"
import { stat } from "fs-extra-p"
import { path7za } from "7zip-bin"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export default class MacPackager extends PlatformPackager<OsXBuildOptions> {
  codeSigningInfo: Promise<CodeSigningInfo>

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
  }

  protected get platform() {
    return Platform.OSX
  }

  async pack(outDir: string, appOutDir: string, arch: string): Promise<any> {
    await super.pack(outDir, appOutDir, arch)
    const codeSigningInfo = await this.codeSigningInfo
    return await this.signMac(path.join(appOutDir, this.appName + ".app"), codeSigningInfo)
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

  packageInDistributableFormat(outDir: string, appOutDir: string): Promise<any> {
    const artifactPath = path.join(appOutDir, `${this.appName}-${this.metadata.version}.dmg`)
    return BluebirdPromise.all([
      new BluebirdPromise<any>(async (resolve, reject) => {
        log("Creating DMG")

        const specification: appdmg.Specification = Object.assign({
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
          try {
            if ((await stat(background)).isFile()) {
              specification.background = background
            }
          }
          catch (e) {
            // ignored
          }
        }

        specification.contents[1].path = path.join(appOutDir, this.appName + ".app")

        const emitter = require("appdmg")({
          target: artifactPath,
          basepath: this.projectDir,
          specification: specification
        })
        emitter.on("error", reject)
        emitter.on("finish", () => resolve())
      })
        .then(() => this.dispatchArtifactCreated(artifactPath, `${this.metadata.name}-${this.metadata.version}.dmg`)),

      this.zipMacApp(appOutDir)
        .then(it => this.dispatchArtifactCreated(it, `${this.metadata.name}-${this.metadata.version}-mac.zip`))
    ])
  }

  private zipMacApp(outDir: string): Promise<string> {
    log("Creating ZIP for Squirrel.Mac")
    // we use app name here - see https://github.com/electron-userland/electron-builder/pull/204
    const resultPath = `${this.appName}-${this.metadata.version}-mac.zip`
    // -y param is important - "store symbolic links as the link instead of the referenced file"
    const args = ["a", "-mm=" + (this.devMetadata.build.compression === "store" ? "Copy" : "Deflate"), "-r", "-bb0", "-bd"]
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