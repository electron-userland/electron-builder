import { InvalidConfigurationError, log, isEmptyOrSpaces } from "builder-util"
import { execWine } from "app-builder-lib"
import { getBinFromUrl } from "app-builder-lib"
import { sanitizeFileName } from "builder-util"
import { Arch, getArchSuffix, SquirrelWindowsOptions, Target, WinPackager } from "app-builder-lib"
import * as path from "path"
import * as fs from "fs"
import * as os from "os"
import { Options as SquirrelOptions, createWindowsInstaller, convertVersion } from "electron-winstaller"

export default class SquirrelWindowsTarget extends Target {
  readonly options: SquirrelWindowsOptions

  isAsyncSupported = false

  constructor(
    private readonly packager: WinPackager,
    readonly outDir: string
  ) {
    super("squirrel")
    this.options = { ...this.packager.platformSpecificBuildOptions, ...this.packager.config.squirrelWindows }
  }

  private async prepareSignedVendorDirectory(): Promise<string> {
    const customSquirrelVendorDirectory = this.options.customSquirrelVendorDir
    const tmpVendorDirectory = await this.packager.info.tempDirManager.createTempDir({ prefix: "squirrel-windows-vendor" })

    if (isEmptyOrSpaces(customSquirrelVendorDirectory) || !fs.existsSync(customSquirrelVendorDirectory)) {
      log.warn({ customSquirrelVendorDirectory: customSquirrelVendorDirectory }, "unable to access custom Squirrel.Windows vendor directory, falling back to default vendor ")
      const windowInstallerPackage = require.resolve("electron-winstaller/package.json")
      const vendorDirectory = path.join(path.dirname(windowInstallerPackage), "vendor")

      const squirrelBin = await getBinFromUrl(
        "squirrel.windows@1.0.0",
        "squirrel.windows-2.0.1-patched.7z",
        "DWijIRRElidu/Rq0yegAKqo2g6aVJUPvcRyvkzUoBPbRasIk61P6xY2fBMdXw6wT17md7NzrTI9/zA1wT9vEqg=="
      )

      await fs.promises.cp(vendorDirectory, tmpVendorDirectory, { recursive: true })
      // copy the patched squirrel to tmp vendor directory
      await fs.promises.cp(path.join(squirrelBin, "electron-winstaller", "vendor"), tmpVendorDirectory, { recursive: true })
    } else {
      // copy the custom squirrel vendor directory to tmp vendor directory
      await fs.promises.cp(customSquirrelVendorDirectory, tmpVendorDirectory, { recursive: true })
    }

    const files = await fs.promises.readdir(tmpVendorDirectory)
    const squirrelExe = files.find(f => f === "Squirrel.exe")
    if (squirrelExe) {
      const filePath = path.join(tmpVendorDirectory, squirrelExe)
      log.debug({ file: filePath }, "signing vendor executable")
      await this.packager.signIf(filePath)
    } else {
      log.warn("Squirrel.exe not found in vendor directory, skipping signing")
    }
    return tmpVendorDirectory
  }

  private async generateStubExecutableExe(appOutDir: string, vendorDir: string) {
    const files = await fs.promises.readdir(appOutDir, { withFileTypes: true })
    const appExe = files.find(f => f.name === `${this.exeName}.exe`)
    if (!appExe) {
      throw new Error(`App executable not found in app directory: ${appOutDir}`)
    }

    const filePath = path.join(appOutDir, appExe.name)
    const stubExePath = path.join(appOutDir, `${this.exeName}_ExecutionStub.exe`)
    await fs.promises.copyFile(path.join(vendorDir, "StubExecutable.exe"), stubExePath)
    await execWine(path.join(vendorDir, "WriteZipToSetup.exe"), null, ["--copy-stub-resources", filePath, stubExePath])
    await this.packager.signIf(stubExePath)
    log.debug({ file: filePath }, "signing app executable")
    await this.packager.signIf(filePath)
  }

  async build(appOutDir: string, arch: Arch) {
    const packager = this.packager
    const version = packager.appInfo.version
    const sanitizedName = sanitizeFileName(this.appName)

    const setupFile = packager.expandArtifactNamePattern(this.options, "exe", arch, "${productName} Setup ${version}.${ext}")
    const installerOutDir = path.join(this.outDir, `squirrel-windows${getArchSuffix(arch)}`)
    const artifactPath = path.join(installerOutDir, setupFile)
    const msiArtifactPath = path.join(installerOutDir, packager.expandArtifactNamePattern(this.options, "msi", arch, "${productName} Setup ${version}.${ext}"))

    this.buildQueueManager.add(async () => {
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
        await packager.signIf(msiArtifactPath)
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
        await packager.info.emitArtifactCreated({
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
    })
    return Promise.resolve()
  }

  private get appName() {
    return this.options.name || this.packager.appInfo.name
  }

  private get exeName() {
    return this.packager.appInfo.productFilename || this.options.name || this.packager.appInfo.productName
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

    if (this.options.loadingGif) {
      options.loadingGif = path.resolve(packager.projectDir, this.options.loadingGif)
    } else {
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
