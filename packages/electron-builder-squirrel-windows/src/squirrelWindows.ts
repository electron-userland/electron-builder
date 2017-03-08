import { Arch, getArchSuffix, Target } from "electron-builder-core"
import { getBinFromBintray } from "electron-builder-util/out/binDownload"
import { log, warn } from "electron-builder-util/out/log"
import { SquirrelWindowsOptions } from "electron-builder/out/options/winOptions"
import { WinPackager } from "electron-builder/out/winPackager"
import * as path from "path"
import { buildInstaller, convertVersion, SquirrelOptions } from "./squirrelPack"

const SW_VERSION = "1.5.2.0"
//noinspection SpellCheckingInspection
const SW_SHA2 = "e96a109d4641ebb85d163eaefe7770b165ebc25d1cc77c5179f021b232fc3730"

export default class SquirrelWindowsTarget extends Target {
  private readonly options: SquirrelWindowsOptions = Object.assign({}, this.packager.platformSpecificBuildOptions, this.packager.config.squirrelWindows)

  constructor(private readonly packager: WinPackager, readonly outDir: string) {
    super("squirrel")
  }

  async build(appOutDir: string, arch: Arch) {
    log(`Building Squirrel.Windows for arch ${Arch[arch]}`)

    if (arch === Arch.ia32) {
      warn("For windows consider only distributing 64-bit or use nsis target, see https://github.com/electron-userland/electron-builder/issues/359#issuecomment-214851130")
    }

    const packager = this.packager
    const appInfo = packager.appInfo
    const version = appInfo.version
    const archSuffix = getArchSuffix(arch)
    const setupFileName = `${appInfo.productFilename} Setup ${version}${archSuffix}.exe`

    const installerOutDir = path.join(this.outDir, `win${getArchSuffix(arch)}`)

    const distOptions = await this.computeEffectiveDistOptions()

    await buildInstaller(<SquirrelOptions>distOptions, installerOutDir, setupFileName, packager, appOutDir)

    packager.dispatchArtifactCreated(path.join(installerOutDir, setupFileName), this, `${appInfo.name}-Setup-${version}${archSuffix}.exe`)

    const packagePrefix = `${appInfo.name}-${convertVersion(version)}-`
    packager.dispatchArtifactCreated(path.join(installerOutDir, `${packagePrefix}full.nupkg`), this)
    if (distOptions.remoteReleases != null) {
      packager.dispatchArtifactCreated(path.join(installerOutDir, `${packagePrefix}delta.nupkg`), this)
    }

    packager.dispatchArtifactCreated(path.join(installerOutDir, "RELEASES"), this)
  }

  async computeEffectiveDistOptions(): Promise<SquirrelOptions> {
    const packager = this.packager
    let iconUrl = this.options.iconUrl || packager.config.iconUrl
    if (iconUrl == null) {
      const info = await packager.info.repositoryInfo
      if (info != null) {
        iconUrl = `https://github.com/${info.user}/${info.project}/blob/master/${packager.relativeBuildResourcesDirname}/icon.ico?raw=true`
      }

      if (iconUrl == null) {
        throw new Error("iconUrl is not specified, please see https://github.com/electron-userland/electron-builder/wiki/Options#WinBuildOptions-iconUrl")
      }
    }

    checkConflictingOptions(this.options)

    const appInfo = packager.appInfo
    const projectUrl = await appInfo.computePackageUrl()
    const options: any = Object.assign({
      name: appInfo.name,
      productName: appInfo.productName,
      appId: this.options.useAppIdAsId ? appInfo.id : appInfo.name,
      version: appInfo.version,
      description: appInfo.description,
      authors: appInfo.companyName,
      iconUrl: iconUrl,
      extraMetadataSpecs: projectUrl == null ? null : `\n    <projectUrl>${projectUrl}</projectUrl>`,
      copyright: appInfo.copyright,
      packageCompressionLevel: parseInt(process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL) || (packager.config.compression === "store" ? 0 : 9),
      vendorPath: await getBinFromBintray("Squirrel.Windows", SW_VERSION, SW_SHA2)
    }, this.options)

    if (options.remoteToken == null) {
      options.remoteToken = process.env.GH_TOKEN
    }

    if (!("loadingGif" in options)) {
      const resourceList = await packager.resourceList
      if (resourceList.includes("install-spinner.gif")) {
        options.loadingGif = path.join(packager.buildResourcesDir, "install-spinner.gif")
      }
    }

    if (options.remoteReleases === true) {
      const info = await packager.info.repositoryInfo
      if (info == null) {
        warn("remoteReleases set to true, but cannot get repository info")
      }
      else {
        options.remoteReleases = `https://github.com/${info.user}/${info.project}`
        log(`remoteReleases is set to ${options.remoteReleases}`)
      }
    }

    return options
  }
}

function checkConflictingOptions(options: any) {
  for (const name of ["outputDirectory", "appDirectory", "exe", "fixUpPaths", "usePackageJson", "extraFileSpecs", "extraMetadataSpecs", "skipUpdateIcon", "setupExe"]) {
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