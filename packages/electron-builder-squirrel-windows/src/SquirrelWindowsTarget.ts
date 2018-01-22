import { InvalidConfigurationError, log } from "builder-util"
import { getBinFromGithub } from "builder-util/out/binDownload"
import { Arch, getArchSuffix, SquirrelWindowsOptions, Target } from "electron-builder-lib"
import { WinPackager } from "electron-builder-lib/out/winPackager"
import * as path from "path"
import sanitizeFileName from "sanitize-filename"
import { convertVersion, SquirrelBuilder, SquirrelOptions } from "./squirrelPack"

export default class SquirrelWindowsTarget extends Target {
  //tslint:disable-next-line:no-object-literal-type-assertion
  readonly options: SquirrelWindowsOptions = {...this.packager.platformSpecificBuildOptions, ...this.packager.config.squirrelWindows} as SquirrelWindowsOptions

  constructor(private readonly packager: WinPackager, readonly outDir: string) {
    super("squirrel")
  }

  async build(appOutDir: string, arch: Arch) {
    const packager = this.packager
    const version = packager.appInfo.version
    const sanitizedName = sanitizeFileName(this.appName)

    // tslint:disable-next-line:no-invalid-template-strings
    const setupFile = packager.expandArtifactNamePattern(this.options, "exe", arch, "${productName} Setup ${version}.${ext}")
    const packageFile = `${sanitizedName}-${convertVersion(version)}-full.nupkg`

    const installerOutDir = path.join(this.outDir, `squirrel-windows${getArchSuffix(arch)}`)

    const artifactPath = path.join(installerOutDir, setupFile)

    this.logBuilding("Squirrel.Windows", artifactPath, arch)
    if (arch === Arch.ia32) {
      log.warn("For windows consider only distributing 64-bit or use nsis target, see https://github.com/electron-userland/electron-builder/issues/359#issuecomment-214851130")
    }

    const distOptions = await this.computeEffectiveDistOptions()
    const squirrelBuilder = new SquirrelBuilder(distOptions as SquirrelOptions, installerOutDir, packager)
    await squirrelBuilder.buildInstaller({setupFile, packageFile}, appOutDir, this.outDir, arch)

    packager.dispatchArtifactCreated(artifactPath, this, arch, `${sanitizedName}-Setup-${version}${getArchSuffix(arch)}.exe`)

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
        iconUrl = `https://github.com/${info.user}/${info.project}/blob/master/${packager.info.relativeBuildResourcesDirname}/icon.ico?raw=true`
      }

      if (iconUrl == null) {
        throw new InvalidConfigurationError("iconUrl is not specified, please see https://electron.build/configuration/configuration#WinBuildOptions-iconUrl")
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
      vendorPath: await getBinFromGithub("Squirrel.Windows", "1.7.8", "p4Z7//ol4qih1xIl2l9lOeFf1RmX4y1eAJkol+3q7iZ0iEMotBhs3HXFLxU435xLRhKghYOjSYu7WiUktsP5Bg=="),
      ...this.options as any,
    }

    if (options.remoteToken == null) {
      options.remoteToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
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
        log.warn("remoteReleases set to true, but cannot get repository info")
      }
      else {
        options.remoteReleases = `https://github.com/${info.user}/${info.project}`
        log.info({remoteReleases: options.remoteReleases}, `remoteReleases is set`)
      }
    }

    return options
  }
}

function checkConflictingOptions(options: any) {
  for (const name of ["outputDirectory", "appDirectory", "exe", "fixUpPaths", "usePackageJson", "extraFileSpecs", "extraMetadataSpecs", "skipUpdateIcon", "setupExe"]) {
    if (name in options) {
      throw new InvalidConfigurationError(`Option ${name} is ignored, do not specify it.`)
    }
  }

  if ("noMsi" in options) {
    log.warn(`noMsi is deprecated, please specify as "msi": true if you want to create an MSI installer`)
    options.msi = !options.noMsi
  }

  const msi = options.msi
  if (msi != null && typeof msi !== "boolean") {
    throw new InvalidConfigurationError(`msi expected to be boolean value, but string '"${msi}"' was specified`)
  }
}
