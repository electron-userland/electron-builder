import { sanitizeFileName } from "builder-util/out/filename"
import { InvalidConfigurationError, log, isEmptyOrSpaces } from "builder-util"
import { Arch, getArchSuffix, SquirrelWindowsOptions, Target } from "app-builder-lib"
import { WinPackager } from "app-builder-lib/out/winPackager"
import * as path from "path"
import * as fs from "fs"
import { Options as SquirrelOptions, createWindowsInstaller, convertVersion } from "electron-winstaller"

export default class SquirrelWindowsTarget extends Target {
  //tslint:disable-next-line:no-object-literal-type-assertion
  readonly options: SquirrelWindowsOptions = { ...this.packager.platformSpecificBuildOptions, ...this.packager.config.squirrelWindows } as SquirrelWindowsOptions

  constructor(
    private readonly packager: WinPackager,
    readonly outDir: string
  ) {
    super("squirrel")
  }

  async build(appOutDir: string, arch: Arch) {
    const packager = this.packager
    const version = packager.appInfo.version
    const sanitizedName = sanitizeFileName(this.appName)

    const setupFile = packager.expandArtifactNamePattern(this.options, "exe", arch, "${productName} Setup ${version}.${ext}")
    const installerOutDir = path.join(this.outDir, `squirrel-windows${getArchSuffix(arch)}`)
    const artifactPath = path.join(installerOutDir, setupFile)

    await packager.info.callArtifactBuildStarted({
      targetPresentableName: "Squirrel.Windows",
      file: artifactPath,
      arch,
    })

    if (arch === Arch.ia32) {
      log.warn("For windows consider only distributing 64-bit or use nsis target, see https://github.com/electron-userland/electron-builder/issues/359#issuecomment-214851130")
    }

    const distOptions = await this.computeEffectiveDistOptions()
    if (distOptions.vendorDirectory) {
      this.select7zipArch(distOptions.vendorDirectory, arch)
    }

    await createWindowsInstaller({
      ...distOptions,
      appDirectory: appOutDir,
      outputDirectory: installerOutDir,
    })

    await packager.info.callArtifactBuildCompleted({
      file: artifactPath,
      target: this,
      arch,
      safeArtifactName: `${sanitizedName}-Setup-${version}${getArchSuffix(arch)}.exe`,
      packager: this.packager,
    })

    const packagePrefix = `${this.appName}-${convertVersion(version)}-`
    packager.info.dispatchArtifactCreated({
      file: path.join(installerOutDir, `${packagePrefix}full.nupkg`),
      target: this,
      arch,
      packager,
    })
    if (distOptions.remoteReleases != null) {
      packager.info.dispatchArtifactCreated({
        file: path.join(installerOutDir, `${packagePrefix}delta.nupkg`),
        target: this,
        arch,
        packager,
      })
    }

    packager.info.dispatchArtifactCreated({
      file: path.join(installerOutDir, "RELEASES"),
      target: this,
      arch,
      packager,
    })
  }

  private get appName() {
    return this.options.name || this.packager.appInfo.name
  }

  private select7zipArch(vendorDirectory: string, arch: Arch) {
    // Copy the 7-Zip executable for the configured architecture.
    const resolvedArch = getArchSuffix(arch) === "" ? process.arch : getArchSuffix(arch)
    fs.copyFileSync(path.join(vendorDirectory, `7z-${resolvedArch}.exe`), path.join(vendorDirectory, "7z.exe"))
    fs.copyFileSync(path.join(vendorDirectory, `7z-${resolvedArch}.dll`), path.join(vendorDirectory, "7z.dll"))
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
        throw new InvalidConfigurationError("squirrelWindows.iconUrl is not specified, please see https://www.electron.build/squirrel-windows#SquirrelWindowsOptions-iconUrl")
      }
    }

    checkConflictingOptions(this.options)

    const appInfo = packager.appInfo
    const projectUrl = await appInfo.computePackageUrl()
    const appName = this.appName
    //  If not specified will use the Squirrel.Windows that is shipped with
    //  electron-installer(https://github.com/electron/windows-installer/tree/main/vendor)
    // After https://github.com/electron-userland/electron-builder-binaries/pull/56 merged, we can use `electron-builder-binaries` to get the latest version of squirrel.
    const vendorDirectory = this.options.customSquirrelExePath
    const options: SquirrelOptions = {
      name: appName,
      appId: this.options.useAppIdAsId ? appInfo.id : appName,
      version: appInfo.version,
      description: appInfo.description,
      exe: `${this.packager.platformSpecificBuildOptions.executableName || this.options.name || appInfo.productName}.exe`,
      authors: appInfo.companyName || "",
      iconUrl,
      extraMetadataSpecs: projectUrl == null ? null : `\n    <projectUrl>${projectUrl}</projectUrl>`,
      copyright: appInfo.copyright,
      packageCompressionLevel: parseInt((process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || packager.compression === "store" ? 0 : 9) as any, 10),
      vendorDirectory,
      nuspecTemplate: path.join(__dirname, "..", "template.nuspectemplate"),
      ...(this.options as any),
    }

    if (await (await packager.signingManager.value).cscInfo.value) {
      options.windowsSign = {
        hookFunction: async (file: string) => {
          await packager.sign(file)
        },
      }
    }

    if (isEmptyOrSpaces(options.description)) {
      options.description = this.options.name || appInfo.productName
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
      } else {
        options.remoteReleases = `https://github.com/${info.user}/${info.project}`
        log.info({ remoteReleases: options.remoteReleases }, `remoteReleases is set`)
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
