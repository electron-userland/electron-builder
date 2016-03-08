import { downloadCertificate } from "./codeSign"
import { Promise as BluebirdPromise } from "bluebird"
import { PlatformPackager, BuildInfo } from "./platformPackager"
import { Platform } from "./metadata"
import * as path from "path"
import { log } from "./util"
import { readFile, deleteFile, stat, rename, copy, emptyDir, Stats, writeFile } from "fs-extra-p"

const __awaiter = require("./awaiter")
Array.isArray(__awaiter)

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

  protected get platform() {
    return Platform.WINDOWS
  }

  pack(platform: string, outDir: string, appOutDir: string, arch: string): Promise<any> {
    if (this.options.dist && !this.isNsis) {
      const installerOut = this.computeDistOut(outDir, arch)
      log("Removing %s", installerOut)
      return BluebirdPromise.all([
        super.pack(platform, outDir, appOutDir, arch),
        emptyDir(installerOut)
      ])
    }
    else {
      return super.pack(platform, outDir, appOutDir, arch)
    }
  }

  private computeDistOut(outDir: string, arch: string): string {
    return path.join(outDir, (this.isNsis ? "nsis" : "win") + (arch === "x64" ? "-x64" : ""))
  }

  async packageInDistributableFormat(outDir: string, appOutDir: string, arch: string): Promise<any> {
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
    const installerOutDir = this.computeDistOut(outDir, arch)
    const archSuffix = arch === "x64" ? "-x64" : ""
    const options = Object.assign({
      name: this.metadata.name,
      productName: this.appName,
      exe: this.appName + ".exe",
      title: this.appName,
      appDirectory: appOutDir,
      outputDirectory: installerOutDir,
      version: version,
      description: this.metadata.description,
      authors: this.metadata.author.name,
      iconUrl: iconUrl,
      setupIcon: path.join(this.buildResourcesDir, "icon.ico"),
      certificateFile: certificateFile,
      certificatePassword: this.options.cscKeyPassword,
      fixUpPaths: false,
      usePackageJson: false
    }, this.customDistOptions)

    // we use metadata.name instead of appName because appName can contains unsafe chars
    const installerExePath = path.join(installerOutDir, this.metadata.name + "Setup-" + version + archSuffix + ".exe")
    if (this.isNsis) {
      return await this.nsis(options, installerExePath)
    }

    try {
      await require("electron-winstaller-fixed").createWindowsInstaller(options)
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

    const releasesFile = path.join(installerOutDir, "RELEASES")
    const nupkgPathOriginal = this.metadata.name + "-" + version + "-full.nupkg"
    const nupkgPathWithArch = this.metadata.name + "-" + version + archSuffix + "-full.nupkg"

    async function changeFileNameInTheReleasesFile() {
      const data = (await readFile(releasesFile, "utf8")).replace(new RegExp(" " + nupkgPathOriginal + " ", "g"), " " + nupkgPathWithArch + " ")
      await writeFile(releasesFile, data)
    }

    await BluebirdPromise.all([
      rename(path.join(installerOutDir, "Setup.exe"), installerExePath)
        .then(it => this.dispatchArtifactCreated(it)),
      rename(path.join(installerOutDir, nupkgPathOriginal), path.join(installerOutDir, nupkgPathWithArch))
        .then(it => this.dispatchArtifactCreated(it)),
      changeFileNameInTheReleasesFile()
        .then(() => {
          if (arch === "x64") {
            this.dispatchArtifactCreated(releasesFile)
            return null
          }
          else {
            return copy(releasesFile, path.join(installerOutDir, "RELEASES-ia32"))
              .then(it => this.dispatchArtifactCreated(it))
          }
        }),
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
          title: options.title,
          version: options.version,
          icon: options.setupIcon,
          publisher: options.authors,
          verbosity: 2
        }, this.customDistOptions)
      }
    }))
  }
}