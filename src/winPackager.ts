import { downloadCertificate } from "./codeSign"
import { Promise as BluebirdPromise } from "bluebird"
import { tsAwaiter } from "./awaiter"
import { PlatformPackager, BuildInfo } from "./platformPackager"
import * as path from "path"
import { Stats } from "fs"
import { stat, renameFile } from "./promisifed-fs"
import { log } from "./util"
import { deleteDirectory, deleteFile } from "./promisifed-fs"

const __awaiter = tsAwaiter
Array.isArray(__awaiter)

export default class WinPackager extends PlatformPackager<any> {
  certFilePromise: Promise<string>

  constructor(info: BuildInfo, cleanupTasks: Array<() => Promise<any>>) {
    super(info)

    // https://developer.mozilla.org/en-US/docs/Signing_an_executable_with_Authenticode
    // https://github.com/Squirrel/Squirrel.Windows/pull/505
    if (this.options.cscLink != null && this.options.cscKeyPassword != null && process.platform !== "darwin") {
      this.certFilePromise = downloadCertificate(this.options.cscLink)
        .then(path => {
          cleanupTasks.push(() => deleteFile(path, true))
          return path
        })
    }
    else {
      this.certFilePromise = BluebirdPromise.resolve(null)
    }
  }

  getBuildConfigurationKey() {
    return "win"
  }

  pack(platform: string, arch: string, outDir: string): Promise<any> {
    if (this.options.dist) {
      const installerOut = outDir + "-installer"
      log("Removing %s", installerOut)
      return BluebirdPromise.all([
        super.pack(platform, arch, outDir),
        deleteDirectory(installerOut)
      ])
    }
    else {
      return super.pack(platform, arch, outDir)
    }
  }

  async packageInDistributableFormat(outDir: string, customConfiguration: any, arch: string): Promise<any> {
    let iconUrl = this.metadata.build.iconUrl
    if (!iconUrl) {
      if (customConfiguration != null) {
        iconUrl = customConfiguration.iconUrl
      }
      if (!iconUrl) {
        if (this.info.repositoryInfo != null) {
          const info = await this.info.repositoryInfo.getInfo(this)
          if (info != null) {
            iconUrl = `https://raw.githubusercontent.com/${info.user}/${info.project}/master/build/icon.ico`
          }
        }

        if (!iconUrl) {
          throw new Error("iconUrl is not specified, please see https://github.com/develar/electron-complete-builder#in-short")
        }
      }
    }

    const certificateFile = await this.certFilePromise

    const version = this.metadata.version
    const outputDirectory = outDir + "-installer"
    const options = Object.assign({
      name: this.metadata.name,
      appDirectory: outDir,
      outputDirectory: outputDirectory,
      productName: this.metadata.name,
      version: version,
      description: this.metadata.description,
      authors: this.metadata.author,
      iconUrl: iconUrl,
      setupIcon: path.join(this.projectDir, "build", "icon.ico"),
      certificateFile: certificateFile,
      certificatePassword: this.options.cscKeyPassword,
    }, customConfiguration)

    try {
      await new BluebirdPromise<any>((resolve, reject) => {
        require("electron-winstaller-temp-fork").build(options, (error: Error) => error == null ? resolve(null) : reject(error))
      })
    }
    catch (e) {
      if (e.message.indexOf("Unable to set icon") < 0) {
        throw e
      }
      else {
        let fileInfo: Stats
        try {
          fileInfo = await stat(options.setupIcon)
        }
        catch (e) {
          throw new Error("Please specify correct setupIcon, file " + options.setupIcon + " not found")
        }

        if (fileInfo.isDirectory()) {
          throw new Error("Please specify correct setupIcon, " + options.setupIcon + " is a directory")
        }
      }
    }

    const appName = this.metadata.name
    const archSuffix = (arch === "x64") ? "-x64" : ""
    return await BluebirdPromise.all([
      renameFile(path.join(outputDirectory, appName + "Setup.exe"), path.join(outputDirectory, appName + "Setup-" + version + archSuffix + ".exe"))
        .then(it => this.dispatchArtifactCreated(it)),
      renameFile(path.join(outputDirectory, appName + "-" + version + "-full.nupkg"), path.join(outputDirectory, appName + "-" + version + archSuffix + "-full.nupkg"))
        .then(it => this.dispatchArtifactCreated(it))
    ])
  }
}