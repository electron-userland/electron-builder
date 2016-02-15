import { PlatformPackager, BuildInfo } from "./platformPackager"
import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { tsAwaiter } from "./awaiter"
import { log, spawn } from "./util"
import { createKeychain, deleteKeychain, CodeSigningInfo, generateKeychainName, sign } from "./codeSign"

const __awaiter = tsAwaiter
Array.isArray(__awaiter)

export default class MacPackager extends PlatformPackager<appdmg.Specification> {
  codeSigningInfo: Promise<CodeSigningInfo>

  constructor(info: BuildInfo, cleanupTasks: Array<() => Promise<any>>) {
    super(info)

    if (this.options.cscLink != null && this.options.cscKeyPassword != null) {
      const keychainName = generateKeychainName()
      cleanupTasks.push(() => deleteKeychain(keychainName))
      this.codeSigningInfo = createKeychain(keychainName, this.options.cscLink, this.options.cscKeyPassword)
    }
    else {
      this.codeSigningInfo = BluebirdPromise.resolve(null)
    }
  }

  getBuildConfigurationKey() {
    return "osx"
  }

  async pack(platform: string, arch: string, outDir: string): Promise<any> {
    await super.pack(platform, arch, outDir)
    let codeSigningInfo = await this.codeSigningInfo
    return await this.signMac(path.join(outDir, this.metadata.name + ".app"), codeSigningInfo)
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

  packageInDistributableFormat(outDir: string, customConfiguration: appdmg.Specification, arch: string): Promise<any> {
    const artifactPath = path.join(outDir, this.metadata.name + "-" + this.metadata.version + ".dmg")
    return BluebirdPromise.all([
      new BluebirdPromise<any>((resolve, reject) => {
        log("Creating DMG")

        const specification: appdmg.Specification = {
          title: this.metadata.name,
          icon: "build/icon.icns",
          "icon-size": 80,
          background: "build/background.png",
          contents: [
            {
              "x": 410, "y": 220, "type": "link", "path": "/Applications"
            },
            {
              "x": 130, "y": 220, "type": "file"
            }
          ]
        }

        if (customConfiguration != null) {
          Object.assign(specification, customConfiguration)
        }

        if (specification.title == null) {
          specification.title = this.metadata.name
        }

        specification.contents[1].path = path.join(outDir, this.metadata.name + ".app")

        const appDmg = require("appdmg")
        const emitter = appDmg({
          target: artifactPath,
          basepath: this.projectDir,
          specification: specification
        })
        emitter.on("error", reject)
        emitter.on("finish", () => resolve())
      })
        .then(() => this.dispatchArtifactCreated(artifactPath)),

      this.zipMacApp(outDir)
        .then(it => this.dispatchArtifactCreated(it))
    ])
  }

  private zipMacApp(outDir: string): Promise<string> {
    log("Creating ZIP for Squirrel.Mac")
    const appName = this.metadata.name
    // -y param is important - "store symbolic links as the link instead of the referenced file"
    const resultPath = `${appName}-${this.metadata.version}-mac.zip`
    return spawn("zip", ["-ryXq", resultPath, appName + ".app"], {
      cwd: outDir,
      stdio: "inherit",
    })
      .thenReturn(outDir + "/" + resultPath)
  }
}