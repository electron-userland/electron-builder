import { downloadCertificate } from "./codeSign"
import { Promise as BluebirdPromise } from "bluebird"
import { PlatformPackager, BuildInfo } from "./platformPackager"
import { Platform, PlatformSpecificBuildOptions } from "./metadata"
import * as path from "path"
import { log } from "./util"
import { readFile, deleteFile, stat, rename, copy, emptyDir, Stats, writeFile } from "fs-extra-p"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export interface WinBuildOptions extends PlatformSpecificBuildOptions {
  readonly certificateFile?: string
  readonly certificatePassword?: string

  readonly icon?: string
  readonly iconUrl?: string

  /**
   Whether to create an MSI installer. Defaults to `true` (MSI is not created).
   */
  readonly noMsi?: boolean
}

export default class WinPackager extends PlatformPackager<WinBuildOptions> {
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

  protected get platform() {
    return Platform.WINDOWS
  }

  pack(platform: string, outDir: string, appOutDir: string, arch: string): Promise<any> {
    if (this.options.dist) {
      const installerOut = WinPackager.computeDistOut(outDir, arch)
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

  private static computeDistOut(outDir: string, arch: string): string {
    return path.join(outDir, "win" + (arch === "x64" ? "-x64" : ""))
  }

  async packageInDistributableFormat(outDir: string, appOutDir: string, arch: string): Promise<any> {
    let iconUrl = this.devMetadata.build.iconUrl
    if (!iconUrl) {
      if (this.customBuildOptions != null) {
        iconUrl = this.customBuildOptions.iconUrl
      }
      if (!iconUrl) {
        if (this.info.repositoryInfo != null) {
          const info = await this.info.repositoryInfo.getInfo(this)
          if (info != null) {
            iconUrl = `https://raw.githubusercontent.com/${info.user}/${info.project}/master/${this.relativeBuildResourcesDirname}/icon.ico`
          }
        }

        if (!iconUrl) {
          throw new Error("iconUrl is not specified, please see https://github.com/electron-userland/electron-builder#in-short")
        }
      }
    }

    const certificateFile = await this.certFilePromise
    const version = this.metadata.version
    const installerOutDir = WinPackager.computeDistOut(outDir, arch)
    const archSuffix = arch === "x64" ? "" : ("-" + arch)
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
      usePackageJson: false,
      noMsi: true,
    }, this.customBuildOptions)

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

    async function changeFileNameInTheReleasesFile(): Promise<void> {
      const data = (await readFile(releasesFile, "utf8")).replace(new RegExp(" " + nupkgPathOriginal + " ", "g"), " " + nupkgPathWithArch + " ")
      await writeFile(releasesFile, data)
    }

    const promises: Array<Promise<any>> = [
      rename(path.join(installerOutDir, "Setup.exe"), path.join(installerOutDir, `${this.appName}Setup-${version}${archSuffix}.exe`))
        .then(it => this.dispatchArtifactCreated(it, `${this.metadata.name}Setup-${version}${archSuffix}.exe`)),
    ]

    if (archSuffix === "") {
      this.dispatchArtifactCreated(path.join(installerOutDir, nupkgPathOriginal))
      this.dispatchArtifactCreated(path.join(installerOutDir, "RELEASES"))
    }
    else {
      promises.push(
        rename(path.join(installerOutDir, nupkgPathOriginal), path.join(installerOutDir, nupkgPathWithArch))
          .then(it => this.dispatchArtifactCreated(it))
      )
      promises.push(
        changeFileNameInTheReleasesFile()
          .then(() => copy(releasesFile, path.join(installerOutDir, "RELEASES-ia32")))
          .then(it => this.dispatchArtifactCreated(it))
      )
    }

    await BluebirdPromise.all(promises)
  }
}