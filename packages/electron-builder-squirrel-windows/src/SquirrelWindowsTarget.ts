import { InvalidConfigurationError, log, isEmptyOrSpaces, exec, getPath7za, debug } from "builder-util"
import { sanitizeFileName } from "builder-util/out/filename"
import { prepareWindowsExecutableArgs as prepareArgs } from "app-builder-lib/out/wine"
import { Arch, getArchSuffix, SquirrelWindowsOptions, Target, WinPackager } from "app-builder-lib"
import * as path from "path"
import * as fs from "fs"
import { Options as SquirrelOptions, createWindowsInstaller, convertVersion } from "electron-winstaller"

export default class SquirrelWindowsTarget extends Target {
  //tslint:disable-next-line:no-object-literal-type-assertion
  readonly options: SquirrelWindowsOptions = { ...this.packager.platformSpecificBuildOptions, ...this.packager.config.squirrelWindows } as SquirrelWindowsOptions
  private appDirectory: string = ""
  private outputDirectory: string = ""

  constructor(
    private readonly packager: WinPackager,
    readonly outDir: string
  ) {
    super("squirrel")
  }

  private async prepareSignedVendorDirectory(): Promise<string> {
    // If not specified will use the Squirrel.Windows that is shipped with electron-installer(https://github.com/electron/windows-installer/tree/main/vendor)
    // After https://github.com/electron-userland/electron-builder-binaries/pull/56 merged, will add `electron-builder-binaries` to get the latest version of squirrel.
    let vendorDirectory = this.options.customSquirrelVendorDir || path.join(require.resolve("electron-winstaller/package.json"), "..", "vendor")
    if (isEmptyOrSpaces(vendorDirectory) || !fs.existsSync(vendorDirectory)) {
      log.warn({ vendorDirectory }, "unable to access Squirrel.Windows vendor directory, falling back to default electron-winstaller")
      vendorDirectory = path.join(require.resolve("electron-winstaller/package.json"), "..", "vendor")
    }

    const tmpVendorDirectory = await this.packager.info.tempDirManager.createTempDir({ prefix: "squirrel-windows-vendor" })
    // Copy entire vendor directory to temp directory
    await fs.promises.cp(vendorDirectory, tmpVendorDirectory, { recursive: true })
    log.debug({ from: vendorDirectory, to: tmpVendorDirectory }, "copied vendor directory")

    const files = await fs.promises.readdir(tmpVendorDirectory)
    for (const file of files) {
      if (["Squirrel.exe", "StubExecutable.exe"].includes(file)) {
        const filePath = path.join(tmpVendorDirectory, file)
        log.debug({ file: filePath }, "signing vendor executable")
        await this.packager.sign(filePath)
      }
    }

    return tmpVendorDirectory
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

    this.appDirectory = appOutDir
    this.outputDirectory = installerOutDir
    const distOptions = await this.computeEffectiveDistOptions()

    distOptions.vendorDirectory = await this.prepareSignedVendorDirectory()
    this.select7zipArch(distOptions.vendorDirectory, arch)
    distOptions.fixUpPaths = true
    distOptions.setupExe = setupFile
    await createWindowsInstaller(distOptions)

    await packager.signAndEditResources(artifactPath, arch, installerOutDir)
    if (this.options.msi && process.platform === "win32") {
      const outFile = setupFile.replace(".exe", ".msi")
      await this.msi(distOptions.vendorDirectory, path.join(installerOutDir, `${distOptions.name}.${distOptions.version}.full.nupkg`), setupFile, installerOutDir, outFile)
      await packager.sign(outFile)
    }

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

  private async execSw(vendorDirectory: string, args: Array<string>) {
    return exec(process.platform === "win32" ? path.join(vendorDirectory, "Squirrel.com") : "mono", prepareArgs(args, path.join(vendorDirectory, "Squirrel-Mono.exe")), {
      env: {
        ...process.env,
        SZA_PATH: await getPath7za(),
      },
    })
  }

  private async msi(vendorDirectory: string, nupkgPath: string, setupPath: string, outputDirectory: string, outFile: string) {
    const args = ["--createMsi", nupkgPath, "--bootstrapperExe", setupPath]
    await this.execSw(vendorDirectory, args)

    //noinspection SpellCheckingInspection
    await exec(path.join(vendorDirectory, "candle.exe"), ["-nologo", "-ext", "WixNetFxExtension", "-out", "Setup.wixobj", "Setup.wxs"], {
      cwd: outputDirectory,
    })
    //noinspection SpellCheckingInspection
    await exec(path.join(vendorDirectory, "light.exe"), ["-ext", "WixNetFxExtension", "-sval", "-out", outFile, "Setup.wixobj"], {
      cwd: outputDirectory,
    })
    //noinspection SpellCheckingInspection
    await Promise.all([
      fs.promises.unlink(path.join(outputDirectory, "Setup.wxs")),
      fs.promises.unlink(path.join(outputDirectory, "Setup.wixobj")),
      fs.promises.unlink(path.join(outputDirectory, outFile.replace(".msi", ".wixpdb"))).catch((e: any) => debug(e.toString())),
    ])
  }

  private select7zipArch(vendorDirectory: string, arch: Arch) {
    // Copy the 7-Zip executable for the configured architecture.
    const resolvedArch = getArchSuffix(arch) === "" ? process.arch : getArchSuffix(arch)
    fs.copyFileSync(path.join(vendorDirectory, `7z-${resolvedArch}.exe`), path.join(vendorDirectory, "7z.exe"))
    fs.copyFileSync(path.join(vendorDirectory, `7z-${resolvedArch}.dll`), path.join(vendorDirectory, "7z.dll"))
  }

  private async createNuspecTemplateWithProjectUrl() {
    const templatePath = path.resolve(__dirname, "..", "template.nuspectemplate")
    const projectUrl = await this.packager.appInfo.computePackageUrl()
    if (projectUrl != null) {
      const nuspecTemplate = await this.packager.info.tempDirManager.getTempFile({ prefix: "template", suffix: ".nuspectemplate" })
      let templateContent = await fs.promises.readFile(templatePath, "utf8")
      const searchString = "<copyright><%- copyright %></copyright>"
      templateContent = templateContent.replace(searchString, `${searchString}\n    <projectUrl>${projectUrl}</projectUrl>`)
      await fs.promises.writeFile(nuspecTemplate, templateContent)
      return nuspecTemplate
    }
    return templatePath
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
    const options: SquirrelOptions = {
      appDirectory: this.appDirectory,
      outputDirectory: this.outputDirectory,
      name: this.options.useAppIdAsId ? appInfo.id : this.appName,
      title: appInfo.productName || appInfo.name,
      version: appInfo.version,
      description: appInfo.description,
      exe: `${appInfo.productFilename || this.options.name || appInfo.productName}.exe`,
      authors: appInfo.companyName || "",
      nuspecTemplate: await this.createNuspecTemplateWithProjectUrl(),
      iconUrl,
      copyright: appInfo.copyright,
      noMsi: true,
      usePackageJson: false,
    }

    if (isEmptyOrSpaces(options.description)) {
      options.description = this.options.name || appInfo.productName
    }

    if (options.remoteToken == null) {
      options.remoteToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
    }

    if (this.options.remoteReleases === true) {
      const info = await packager.info.repositoryInfo
      if (info == null) {
        log.warn("remoteReleases set to true, but cannot get repository info")
      } else {
        options.remoteReleases = `https://github.com/${info.user}/${info.project}`
        log.info({ remoteReleases: options.remoteReleases }, `remoteReleases is set`)
      }
    } else if (typeof this.options.remoteReleases === "string" && !isEmptyOrSpaces(this.options.remoteReleases)) {
      options.remoteReleases = this.options.remoteReleases
    }

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
