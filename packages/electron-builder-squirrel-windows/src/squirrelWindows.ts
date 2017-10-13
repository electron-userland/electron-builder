import { log, warn } from "builder-util"
import { getBinFromGithub } from "builder-util/out/binDownload"
import { Arch, getArchSuffix, SquirrelWindowsOptions, Target } from "electron-builder"
import { WinPackager } from "electron-builder/out/winPackager"
import * as path from "path"
import sanitizeFileName from "sanitize-filename"
import { buildInstaller, convertVersion, SquirrelOptions } from "./squirrelPack"

const SW_VERSION = "1.6.0.0"
//noinspection SpellCheckingInspection
const SW_SHA2 = "ipd/ZQXyCe2+CYmNiUa9+nzVuO2PsRfF6DT8Y2mbIzkc8SVH8tJ6uS4rdhwAI1rPsYkmsPe1AcJGqv8ZDZcFww=="

export default class SquirrelWindowsTarget extends Target {
  readonly options: SquirrelWindowsOptions = {...this.packager.platformSpecificBuildOptions, ...this.packager.config.squirrelWindows}

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

    const sanitizedName = sanitizeFileName(this.appName)

    // tslint:disable-next-line:no-invalid-template-strings
    const setupFile = packager.expandArtifactNamePattern(this.options, "exe", arch, "${productName} Setup ${version}.${ext}")
    const packageFile = `${sanitizedName}-${convertVersion(version)}-full.nupkg`

    const installerOutDir = path.join(this.outDir, `win${getArchSuffix(arch)}`)
    const distOptions = await this.computeEffectiveDistOptions()
    await buildInstaller(distOptions as SquirrelOptions, installerOutDir, {setupFile, packageFile}, packager, appOutDir, this.outDir, arch)
    packager.dispatchArtifactCreated(path.join(installerOutDir, setupFile), this, arch, `${sanitizedName}-Setup-${version}${archSuffix}.exe`)

    const packagePrefix = `${this.appName}-${convertVersion(version)}-`
    packager.dispatchArtifactCreated(path.join(installerOutDir, `${packagePrefix}full.nupkg`), this, arch)
    if (distOptions.remoteReleases != null) {
      packager.dispatchArtifactCreated(path.join(installerOutDir, `${packagePrefix}delta.nupkg`), this, arch)
    }

    packager.dispatchArtifactCreated(path.join(installerOutDir, "RELEASES"), this, arch)
  }

  private get appName() {
    return this.options.name || this.packager.appInfo.name
  }

  async computeEffectiveDistOptions(): Promise<SquirrelOptions> {
    const packager = this.packager
    let iconUrl = this.options.iconUrl
    if (iconUrl == null) {
      const info = await packager.info.repositoryInfo
      if (info != null) {
        iconUrl = `https://github.com/${info.user}/${info.project}/blob/master/${packager.relativeBuildResourcesDirname}/icon.ico?raw=true`
      }

      if (iconUrl == null) {
        throw new Error("iconUrl is not specified, please see https://electron.build/configuration/configuration#WinBuildOptions-iconUrl")
      }
    }

    checkConflictingOptions(this.options)

    const appInfo = packager.appInfo
    const projectUrl = await appInfo.computePackageUrl()
    const appName = this.appName
    const options: SquirrelOptions = {
      name: appName,
      productName: this.options.name || appInfo.productName,
      appId: this.options.useAppIdAsId ? appInfo.id : appName,
      version: appInfo.version,
      description: appInfo.description,
      // better to explicitly set to empty string, to avoid any nugget errors
      authors: appInfo.companyName || "",
      iconUrl,
      extraMetadataSpecs: projectUrl == null ? null : `\n    <projectUrl>${projectUrl}</projectUrl>`,
      copyright: appInfo.copyright,
      packageCompressionLevel: parseInt((process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || packager.compression === "store" ? 0 : 9) as any, 10),
      vendorPath: await getBinFromGithub("Squirrel.Windows", SW_VERSION, SW_SHA2),
      ...this.options as any,
    }

    if (options.remoteToken == null) {
      options.remoteToken = process.env.GH_TOKEN
    }

    if (!("loadingGif" in options)) {
      const resourceList = await packager.resourceList
      if (resourceList.includes("install-spinner.gif")) {
        options.loadingGif = path.join(packager.buildResourcesDir, "install-spinner.gif")
      }
    }

    if (this.options.remoteReleases === true) {
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
