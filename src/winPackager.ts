import { downloadCertificate } from "./codeSign"
import { Promise as BluebirdPromise } from "bluebird"
import { tsAwaiter } from "./awaiter"
import { PlatformPackager, BuildInfo } from "./platformPackager"
import * as path from "path"
import { Stats } from "fs"
import { log } from "./util"
import { deleteFile, stat, renameFile } from "./promisifed-fs"
import * as fse from "fs-extra"

const __awaiter = tsAwaiter
Array.isArray(__awaiter)

const emptyDir = BluebirdPromise.promisify(fse.emptyDir)

export default class WinPackager extends PlatformPackager<any> {
  certFilePromise: Promise<string>
  isNsis: boolean

  constructor(info: BuildInfo, cleanupTasks: Array<() => Promise<any>>) {
    super(info)

    // we are not going to support build both nsis and squirrel
    this.isNsis = this.options.target != null && this.options.target.includes("nsis")
    if (this.isNsis) {
      // it is not an optimization, win.js cannot be runned in highly concurrent environment and we get
      // "Error: EBUSY: resource busy or locked, unlink 'C:\Users\appveyor\AppData\Local\Temp\1\icon.ico'"
      // on appveyor (well, yes, it is a Windows bug)
      // Because NSIS support will be dropped some day, correct solution is not implemented
      const iconPath = this.customDistOptions == null ? null : this.customDistOptions.icon
      require("../lib/win").copyAssetsToTmpFolder(iconPath || path.join(this.buildResourcesDir, "icon.ico"))
    }

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

  pack(platform: string, outDir: string, appOutDir: string): Promise<any> {
    if (this.options.dist && !this.isNsis) {
      const installerOut = this.computeDistOut(outDir)
      log("Removing %s", installerOut)
      return BluebirdPromise.all([
        super.pack(platform, outDir, appOutDir),
        emptyDir(installerOut)
      ])
    }
    else {
      return super.pack(platform, outDir, appOutDir)
    }
  }

  private computeDistOut(outDir: string): string {
    return path.join(outDir, (this.isNsis ? "nsis" : "win") + (this.currentArch === "x64" ? "-x64" : ""))
  }

  async packageInDistributableFormat(outDir: string, appOutDir: string): Promise<any> {
    let iconUrl = this.metadata.build.iconUrl
    if (!iconUrl) {
      if (this.customDistOptions != null) {
        iconUrl = this.customDistOptions.iconUrl
      }
      if (!iconUrl) {
        if (this.info.repositoryInfo != null) {
          const info = await this.info.repositoryInfo.getInfo(this)
          if (info != null) {
            iconUrl = `https://raw.githubusercontent.com/${info.user}/${info.project}/master/${this.relativeBuildResourcesDirname}/icon.ico`
          }
        }

        if (!iconUrl) {
          throw new Error("iconUrl is not specified, please see https://github.com/loopline-systems/electron-builder#in-short")
        }
      }
    }

    const certificateFile = await this.certFilePromise
    const version = this.metadata.version
    const installerOutDir = this.computeDistOut(outDir)
    const appName = this.metadata.name
    const archSuffix = this.currentArch === "x64" ? "-x64" : ""
    const installerExePath = path.join(installerOutDir, appName + "Setup-" + version + archSuffix + ".exe")
    const options = Object.assign({
      name: this.metadata.name,
      appDirectory: appOutDir,
      outputDirectory: installerOutDir,
      productName: appName,
      version: version,
      description: this.metadata.description,
      authors: this.metadata.author.name,
      iconUrl: iconUrl,
      setupIcon: path.join(this.buildResourcesDir, "icon.ico"),
      certificateFile: certificateFile,
      certificatePassword: this.options.cscKeyPassword,
      fixUpPaths: false
    }, this.customDistOptions)

    if (this.isNsis) {
      return await this.nsis(options, installerExePath)
    }

    try {
      await require("electron-winstaller-temp-fork").createWindowsInstaller(options)
    }
    catch (e) {
      if (!e.message.includes("Unable to set icon")) {
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

    return await BluebirdPromise.all([
      renameFile(path.join(installerOutDir, "Setup.exe"), installerExePath)
        .then(it => this.dispatchArtifactCreated(it)),
      renameFile(path.join(installerOutDir, appName + "-" + version + "-full.nupkg"), path.join(installerOutDir, appName + "-" + version + archSuffix + "-full.nupkg"))
        .then(it => this.dispatchArtifactCreated(it))
    ])
  }

  private async nsis(options: any, installerFile: string) {
    const build = <(options: any, callback: (error: Error) => void) => void>require("../lib/win").init().build
    // nsis cannot create dir
    await emptyDir(options.outputDirectory)
    return await BluebirdPromise.promisify(build)(Object.assign(options, {
      log: console.log,
      appPath: options.appDirectory,
      out: options.outputDirectory,
      platform: "win32",
      outFile: installerFile,
      copyAssetsToTmpFolder: false,
      config: {
        win: Object.assign({
          title: options.name,
          version: options.version,
          icon: options.setupIcon,
          publisher: options.authors,
          verbosity: 2
        }, this.customDistOptions)
      }
    }))
  }
}