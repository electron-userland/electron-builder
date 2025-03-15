import { InvalidConfigurationError, log, isEmptyOrSpaces } from "builder-util"
import { execWine } from "app-builder-lib/out/wine"
import { sanitizeFileName } from "builder-util/out/filename"
import { Arch, getArchSuffix, SquirrelWindowsOptions, Target, WinPackager } from "app-builder-lib"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
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

  private async prepareSignedVendorDirectory(): Promise<string> {
    let vendorDirectory = this.options.customSquirrelVendorDir
    if (isEmptyOrSpaces(vendorDirectory) || !fs.existsSync(vendorDirectory)) {
      log.warn({ vendorDirectory }, "unable to access custom Squirrel.Windows vendor directory, falling back to default vendor ")
      vendorDirectory = path.resolve(__dirname, "..", "vendor")
    }

    const tmpVendorDirectory = await this.packager.info.tempDirManager.createTempDir({ prefix: "squirrel-windows-vendor" })
    // Copy entire vendor directory to temp directory
    await fs.promises.cp(vendorDirectory, tmpVendorDirectory, { recursive: true })
    log.debug({ from: vendorDirectory, to: tmpVendorDirectory }, "copied vendor directory")

    const files = await fs.promises.readdir(tmpVendorDirectory)
    for (const file of files) {
      if (file === "Squirrel.exe") {
        const filePath = path.join(tmpVendorDirectory, file)
        log.debug({ file: filePath }, "signing vendor executable")
        await this.packager.sign(filePath)
        break
      }
    }
    return tmpVendorDirectory
  }

  private async generateStubExecutableExe(appOutDir: string, vendorDir: string) {
    const files = await fs.promises.readdir(appOutDir, { withFileTypes: true })
    for (const file of files) {
      if (file.isFile() && file.name.toLocaleLowerCase().endsWith(".exe") && file.name.toLocaleLowerCase() !== "squirrel.exe") {
        const filePath = path.join(appOutDir, file.name)
        log.debug({ file: filePath }, "generating stub executable for exe")
        const fileNameWithoutExt = file.name.slice(0, -4)
        const stubExePath = path.join(appOutDir, `${fileNameWithoutExt}_ExecutionStub.exe`)
        await fs.promises.copyFile(path.join(vendorDir, "StubExecutable.exe"), stubExePath)
        await execWine(path.join(vendorDir, "WriteZipToSetup.exe"), null, ["--copy-stub-resources", filePath, stubExePath])
        await this.packager.sign(stubExePath)
      }
    }
  }

  async build(appOutDir: string, arch: Arch) {
    const packager = this.packager
    const version = packager.appInfo.version
    const sanitizedName = sanitizeFileName(this.appName)

    const setupFile = packager.expandArtifactNamePattern(this.options, "exe", arch, "${productName} Setup ${version}.${ext}")
    const installerOutDir = path.join(this.outDir, `squirrel-windows${getArchSuffix(arch)}`)
    const artifactPath = path.join(installerOutDir, setupFile)
    const msiArtifactPath = path.join(installerOutDir, packager.expandArtifactNamePattern(this.options, "msi", arch, "${productName} Setup ${version}.${ext}"))

    await packager.info.emitArtifactBuildStarted({
      targetPresentableName: "Squirrel.Windows",
      file: artifactPath,
      arch,
    })

    const distOptions = await this.computeEffectiveDistOptions(appOutDir, installerOutDir, setupFile)
    await this.generateStubExecutableExe(appOutDir, distOptions.vendorDirectory!)
    await createWindowsInstaller(distOptions)

    await packager.signAndEditResources(artifactPath, arch, installerOutDir)
    if (this.options.msi) {
      await packager.sign(msiArtifactPath)
    }

    const safeArtifactName = (ext: string) => `${sanitizedName}-Setup-${version}${getArchSuffix(arch)}.${ext}`

    await packager.info.emitArtifactBuildCompleted({
      file: artifactPath,
      target: this,
      arch,
      safeArtifactName: safeArtifactName("exe"),
      packager: this.packager,
    })

    if (this.options.msi) {
      await packager.info.emitArtifactBuildCompleted({
        file: msiArtifactPath,
        target: this,
        arch,
        safeArtifactName: safeArtifactName("msi"),
        packager: this.packager,
      })
    }

    const packagePrefix = `${this.appName}-${convertVersion(version)}-`
    await packager.info.emitArtifactCreated({
      file: path.join(installerOutDir, `${packagePrefix}full.nupkg`),
      target: this,
      arch,
      packager,
    })
    if (distOptions.remoteReleases != null) {
      await packager.info.emitArtifactCreated({
        file: path.join(installerOutDir, `${packagePrefix}delta.nupkg`),
        target: this,
        arch,
        packager,
      })
    }

    await packager.info.emitArtifactCreated({
      file: path.join(installerOutDir, "RELEASES"),
      target: this,
      arch,
      packager,
    })
  }

  private get appName() {
    return this.options.name || this.packager.appInfo.name
  }

  private select7zipArch(vendorDirectory: string) {
    // https://github.com/electron/windows-installer/blob/main/script/select-7z-arch.js
    // Even if we're cross-compiling for a different arch like arm64,
    // we still need to use the 7-Zip executable for the host arch
    const resolvedArch = os.arch
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

  async computeEffectiveDistOptions(appDirectory: string, outputDirectory: string, setupFile: string): Promise<SquirrelOptions> {
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
      appDirectory: appDirectory,
      outputDirectory: outputDirectory,
      name: this.options.useAppIdAsId ? appInfo.id : this.appName,
      title: appInfo.productName || appInfo.name,
      version: appInfo.version,
      description: appInfo.description,
      exe: `${appInfo.productFilename || this.options.name || appInfo.productName}.exe`,
      authors: appInfo.companyName || "",
      nuspecTemplate: await this.createNuspecTemplateWithProjectUrl(),
      iconUrl,
      copyright: appInfo.copyright,
      noMsi: !this.options.msi,
      usePackageJson: false,
    }

    options.vendorDirectory = await this.prepareSignedVendorDirectory()
    this.select7zipArch(options.vendorDirectory)
    options.fixUpPaths = true
    options.setupExe = setupFile
    if (this.options.msi) {
      options.setupMsi = setupFile.replace(".exe", ".msi")
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
