import { WinPackager } from "../winPackager"
import { getArchSuffix, smarten } from "../platformPackager"
import { ElectronPackagerOptions } from "electron-packager-tf"
import { Arch, WinBuildOptions } from "../metadata"
import { createWindowsInstaller, convertVersion } from "electron-winstaller-fixed"
import * as path from "path"
import { warn } from "../util"
import { emptyDir } from "fs-extra-p"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../awaiter")

export default class SquirrelWindowsTarget {
  constructor(private packager: WinPackager, private appOutDir: string, private arch: Arch) {
  }

  async build(packOptions: ElectronPackagerOptions) {
    const version = this.packager.metadata.version
    const archSuffix = getArchSuffix(this.arch)
    const setupExeName = `${this.packager.appName} Setup ${version}${archSuffix}.exe`

    const installerOutDir = path.join(this.appOutDir, "..", `win${getArchSuffix(this.arch)}`)
    await emptyDir(installerOutDir)

    const distOptions = await this.computeEffectiveDistOptions(installerOutDir, packOptions, setupExeName)
    await createWindowsInstaller(distOptions)
    this.packager.dispatchArtifactCreated(path.join(installerOutDir, setupExeName), `${this.packager.metadata.name}-Setup-${version}${archSuffix}.exe`)

    const packagePrefix = `${this.packager.metadata.name}-${convertVersion(version)}-`
    this.packager.dispatchArtifactCreated(path.join(installerOutDir, `${packagePrefix}full.nupkg`))
    if (distOptions.remoteReleases != null) {
      this.packager.dispatchArtifactCreated(path.join(installerOutDir, `${packagePrefix}delta.nupkg`))
    }

    this.packager.dispatchArtifactCreated(path.join(installerOutDir, "RELEASES"))
  }

  async computeEffectiveDistOptions(installerOutDir: string, packOptions: ElectronPackagerOptions, setupExeName: string): Promise<WinBuildOptions> {
    const packager = this.packager
    let iconUrl = packager.customBuildOptions.iconUrl || packager.devMetadata.build.iconUrl
    if (iconUrl == null) {
      if (packager.info.repositoryInfo != null) {
        const info = await packager.info.repositoryInfo.getInfo(packager)
        if (info != null) {
          iconUrl = `https://github.com/${info.user}/${info.project}/blob/master/${packager.relativeBuildResourcesDirname}/icon.ico?raw=true`
        }
      }

      if (iconUrl == null) {
        throw new Error("iconUrl is not specified, please see https://github.com/electron-userland/electron-builder/wiki/Options#WinBuildOptions-iconUrl")
      }
    }

    checkConflictingOptions(packager.customBuildOptions)

    const projectUrl = await packager.computePackageUrl()
    const rceditOptions = {
      "version-string": packOptions["version-string"],
      "file-version": packOptions["build-version"],
      "product-version": packOptions["app-version"],
    }
    rceditOptions["version-string"]!.LegalCopyright = packOptions["app-copyright"]

    const cscInfo = await packager.cscInfo
    const options: any = Object.assign({
      name: packager.metadata.name,
      productName: packager.appName,
      exe: packager.appName + ".exe",
      setupExe: setupExeName,
      title: packager.appName,
      appDirectory: this.appOutDir,
      outputDirectory: installerOutDir,
      version: packager.metadata.version,
      description: smarten(packager.metadata.description),
      authors: packager.metadata.author.name,
      iconUrl: iconUrl,
      setupIcon: await packager.iconPath,
      certificateFile: cscInfo == null ? null : cscInfo.file,
      certificatePassword: cscInfo == null ? null : cscInfo.password,
      fixUpPaths: false,
      skipUpdateIcon: true,
      usePackageJson: false,
      extraMetadataSpecs: projectUrl == null ? null : `\n    <projectUrl>${projectUrl}</projectUrl>`,
      copyright: packOptions["app-copyright"],
      packageCompressionLevel: packager.devMetadata.build.compression === "store" ? 0 : 9,
      sign: {
        name: packager.appName,
        site: projectUrl,
        overwrite: true,
        hash: packager.customBuildOptions.signingHashAlgorithms,
      },
      rcedit: rceditOptions,
    }, packager.customBuildOptions)

    if (!("loadingGif" in options)) {
      const resourceList = await packager.resourceList
      if (resourceList.includes("install-spinner.gif")) {
        options.loadingGif = path.join(packager.buildResourcesDir, "install-spinner.gif")
      }
    }

    return options
  }
}

function checkConflictingOptions(options: any) {
  for (let name of ["outputDirectory", "appDirectory", "exe", "fixUpPaths", "usePackageJson", "extraFileSpecs", "extraMetadataSpecs", "skipUpdateIcon", "setupExe"]) {
    if (name in options) {
      throw new Error(`Option ${name} is ignored, do not specify it.`)
    }
  }

  if ("noMsi" in options) {
    warn(`noMsi is deprecated, please specify as "msi": true if you want to create an MSI installer`)
    options.msi = !options.noMsi
  }

  const msi = options.msi
  if (msi != null && typeof msi !== "boolean") {
    throw new Error(`msi expected to be boolean value, but string '"${msi}"' was specified`)
  }
}