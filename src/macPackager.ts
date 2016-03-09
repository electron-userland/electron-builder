import { PlatformPackager, BuildInfo } from "./platformPackager"
import { Platform } from "./metadata"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { log, spawn } from "./util"
import { createKeychain, deleteKeychain, CodeSigningInfo, generateKeychainName, sign } from "./codeSign"

const __awaiter = require("./awaiter")
Array.isArray(__awaiter)

export default class MacPackager extends PlatformPackager<appdmg.Specification> {
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

  async pack(platform: string, outDir: string, appOutDir: string, arch: string): Promise<any> {
    await super.pack(platform, outDir, appOutDir, arch)
    let codeSigningInfo = await this.codeSigningInfo
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
    const artifactPath = path.join(appOutDir, this.metadata.name + "-" + this.metadata.version + ".dmg")
    return BluebirdPromise.all([
      new BluebirdPromise<any>((resolve, reject) => {
        log("Creating DMG")

        const specification: appdmg.Specification = {
          title: this.appName,
          icon: path.join(this.buildResourcesDir, "icon.icns"),
          "icon-size": 80,
          background: path.join(this.buildResourcesDir, "background.png"),
          contents: [
            {
              "x": 410, "y": 220, "type": "link", "path": "/Applications"
            },
            {
              "x": 130, "y": 220, "type": "file"
            }
          ]
        }

        if (this.customDistOptions != null) {
          Object.assign(specification, this.customDistOptions)
        }

        if (specification.title == null) {
          specification.title = this.appName
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
        .then(() => this.dispatchArtifactCreated(artifactPath)),

      this.zipMacApp(appOutDir)
        .then(it => this.dispatchArtifactCreated(it))
    ])
  }

  private zipMacApp(outDir: string): Promise<string> {
    log("Creating ZIP for Squirrel.Mac")
    // -y param is important - "store symbolic links as the link instead of the referenced file"
    const resultPath = `${this.metadata.name}-${this.metadata.version}-mac.zip`
    const args = ["-ryXq", resultPath, this.appName + ".app"]

    // todo move to options
    if (process.env.TEST_MODE === "true") {
      args.unshift("-0")
    }

    return spawn("zip", args, {
      cwd: outDir,
      stdio: "inherit",
    })
      .thenReturn(outDir + "/" + resultPath)
  }
}