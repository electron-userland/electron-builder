import { Arch, getArchSuffix, SquirrelWindowsOptions, Target, WinPackager } from "app-builder-lib"
import { getRceditBundle, withToolsetLock, WineVmManager } from "app-builder-lib/internal"
import { InvalidConfigurationError, isEmptyOrSpaces, log } from "builder-util"
import { sanitizeFileName } from "builder-util/internal"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { getSquirrelToolsetPath, getWixToolsetPath, prepareNugetExe } from "./toolset.js"
import { InstallerOptions, convertVersion, createWindowsInstaller } from "./windowsInstaller.js"

export default class SquirrelWindowsTarget extends Target {
  readonly options: SquirrelWindowsOptions

  isAsyncSupported = false

  constructor(
    private readonly packager: WinPackager,
    readonly outDir: string
  ) {
    super("squirrel")
    this.options = packager.getOptionsForTarget<SquirrelWindowsOptions>("squirrelWindows")
  }

  private async prepareSignedVendorDirectory(): Promise<string> {
    const tmpVendorDirectory = await this.packager.tempDirManager.createTempDir({ prefix: "squirrel-windows-vendor" })

    // The vendor toolset comes from the maintained squirrel.windows bundle. Pin a version or supply a
    // custom/local bundle (e.g. for air-gapped builds) via `toolsets.squirrel` (a ToolsetCustom object).
    const squirrelToolset = await getSquirrelToolsetPath(this.packager.config.toolsets?.squirrel, this.packager.buildResourcesDir)
    await fs.promises.cp(path.join(squirrelToolset, "electron-winstaller", "vendor"), tmpVendorDirectory, { recursive: true })

    // TEMPORARY: the published squirrel.windows@1.1.0 bundle ships the Chocolatey shim for nuget.exe,
    // which resolves the real binary relative to its own install path and fails once relocated to a
    // temp vendor directory. Replace it with a standalone portable nuget.exe (no-op when the bundle
    // already ships a real one). Remove once squirrel.windows bundles it (electron-builder-binaries#203).
    await prepareNugetExe(tmpVendorDirectory)

    // Both Squirrel.exe and Squirrel-Mono.exe shell out to rcedit.exe (via setPEVersionInfoAndIcon)
    // during --releasify to stamp version info and the app icon into Setup.exe, so rcedit must live in
    // the vendor dir on every host — on non-Windows it runs under wine alongside the other Win32 vendor
    // exes (Setup.exe, StubExecutable.exe, …). The bundle omits rcedit, so resolve it from the
    // win-codesign toolset, which already versions and caches it across platforms.
    //
    // getRceditBundle honors the user's `toolsets.winCodeSign` selection, so users retain a bypass if a
    // newer toolset regresses: `"0.0.0"` falls back to the legacy winCodeSign-2.6.0 rcedit, a custom
    // toolset object uses their own rcedit, and the default (unset/"latest") pulls rcedit-windows-2_0_0.
    const rcedit = await getRceditBundle(this.packager.config.toolsets?.winCodeSign, this.packager.buildResourcesDir)
    // Pick rcedit by host arch (x64 for x64/arm64, x86 only for ia32). On non-Windows it runs under wine:
    // the 32-bit build fails on arm64 macOS even under Rosetta (which translates x64, not x86), so the x64
    // build is required there.
    const rceditExe = os.arch() === "ia32" ? rcedit.x86 : rcedit.x64
    await fs.promises.copyFile(rceditExe, path.join(tmpVendorDirectory, "rcedit.exe"))

    // When building an MSI, Squirrel's createMsiPackage runs candle.exe/light.exe from the vendor dir and
    // reads template.wxs there. The bundle ships neither, so merge the shared WiX toolset (the same
    // candle/light electron-builder's MSI target uses) into the vendor dir, plus the Squirrel MSI template
    // (authored against the v4 namespace this transitional WiX 4 requires).
    if (this.options.msi) {
      const wixToolset = await getWixToolsetPath()
      await fs.promises.cp(wixToolset, tmpVendorDirectory, { recursive: true })
      await fs.promises.copyFile(path.resolve(import.meta.dirname, "..", "template.wxs"), path.join(tmpVendorDirectory, "template.wxs"))
    }

    // Squirrel.exe is the core updater binary the bundle always ships; a missing one means a broken
    // vendor toolset. Fail loudly rather than skipping signing — skipping would produce a broken
    // installer and bypass the forceCodeSigning enforcement inside signIf (its awaited promise rejects
    // when the file can't be signed and forceCodeSigning is set).
    const files = await fs.promises.readdir(tmpVendorDirectory)
    if (!files.includes("Squirrel.exe")) {
      throw new Error(`Squirrel.exe not found in vendor directory: ${tmpVendorDirectory}`)
    }
    const squirrelExePath = path.join(tmpVendorDirectory, "Squirrel.exe")
    log.debug({ file: squirrelExePath }, "signing vendor executable")
    await this.packager.signIf(squirrelExePath)
    return tmpVendorDirectory
  }

  private assertShellSafePath(filePath: string, description: string): void {
    if (/[\r\n\0`$;&|<>]/.test(filePath)) {
      throw new InvalidConfigurationError(`${description} contains unsafe shell characters: ${filePath}`)
    }
  }

  private async ensurePathInside(baseDir: string, targetPath: string, description: string): Promise<string> {
    const resolvedBaseDir = path.resolve(baseDir)
    const resolvedTargetPath = path.resolve(targetPath)

    let canonicalBaseDir = resolvedBaseDir
    let canonicalTargetPath = resolvedTargetPath

    try {
      canonicalBaseDir = await fs.promises.realpath(resolvedBaseDir)
    } catch {
      canonicalBaseDir = resolvedBaseDir
    }

    try {
      canonicalTargetPath = await fs.promises.realpath(resolvedTargetPath)
    } catch {
      // Target may not exist yet; resolve the parent to handle symlinks/junctions consistently
      try {
        const resolvedTargetParent = path.dirname(resolvedTargetPath)
        const canonicalTargetParent = await fs.promises.realpath(resolvedTargetParent)
        const relativeFromResolvedParent = path.relative(resolvedTargetParent, resolvedTargetPath)
        if (
          isEmptyOrSpaces(relativeFromResolvedParent) ||
          path.isAbsolute(relativeFromResolvedParent) ||
          relativeFromResolvedParent.split(path.sep).includes("..") ||
          /[\0\r\n]/.test(relativeFromResolvedParent)
        ) {
          throw new InvalidConfigurationError(`${description} contains invalid path segments`)
        }
        canonicalTargetPath = path.resolve(canonicalTargetParent, relativeFromResolvedParent)
      } catch (e: unknown) {
        // Only fall back for filesystem errors (target parent not found, permission, etc.).
        // Validation errors must propagate so callers get an actionable message.
        if (e instanceof InvalidConfigurationError) {
          throw e
        }
        canonicalTargetPath = resolvedTargetPath
      }
    }

    const relativePath = path.relative(canonicalBaseDir, canonicalTargetPath)
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new InvalidConfigurationError(`${description} must be inside ${canonicalBaseDir}`)
    }
    this.assertShellSafePath(canonicalTargetPath, description)
    return canonicalTargetPath
  }

  private async generateStubExecutableExe(appOutDir: string, vendorDir: string) {
    if (!path.isAbsolute(appOutDir) || !path.isAbsolute(vendorDir)) {
      throw new InvalidConfigurationError("appOutDir and vendorDir must be absolute paths")
    }

    const files = await fs.promises.readdir(appOutDir, { withFileTypes: true })
    const appExe = files.find(f => f.name === `${this.exeName}.exe`)
    if (!appExe) {
      throw new Error(`App executable not found in app directory: ${appOutDir}`)
    }

    const filePath = await this.ensurePathInside(appOutDir, path.join(appOutDir, appExe.name), "App executable path")
    const stubExePath = await this.ensurePathInside(appOutDir, path.join(appOutDir, `${this.exeName}_ExecutionStub.exe`), "Stub executable path")
    const stubExecutableSource = await this.ensurePathInside(vendorDir, path.join(vendorDir, "StubExecutable.exe"), "Stub executable source")
    const writeZipToSetupExe = await this.ensurePathInside(vendorDir, path.join(vendorDir, "WriteZipToSetup.exe"), "WriteZipToSetup executable")

    await fs.promises.copyFile(stubExecutableSource, stubExePath)
    const wineVm = new WineVmManager(this.packager.config.toolsets?.wine, this.packager.buildResourcesDir)
    await wineVm.exec(writeZipToSetupExe, ["--copy-stub-resources", filePath, stubExePath])
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
      await packager.emitArtifactBuildStarted({
        targetPresentableName: "Squirrel.Windows",
        file: artifactPath,
        arch,
      })
      const distOptions = await this.computeEffectiveDistOptions(appOutDir, installerOutDir, setupFile)
      await this.generateStubExecutableExe(appOutDir, distOptions.vendorDirectory)
      await withToolsetLock(() => createWindowsInstaller(distOptions))

      await packager.signAndEditResources(artifactPath, arch, installerOutDir)

      if (this.options.msi) {
        await packager.signIf(msiArtifactPath)
      }

      const safeArtifactName = (ext: string) => `${sanitizedName}-Setup-${version}${getArchSuffix(arch)}.${ext}`

      await packager.emitArtifactBuildCompleted({
        file: artifactPath,
        target: this,
        arch,
        safeArtifactName: safeArtifactName("exe"),
        packager: this.packager,
      })

      if (this.options.msi) {
        await packager.emitArtifactCreated({
          file: msiArtifactPath,
          target: this,
          arch,
          safeArtifactName: safeArtifactName("msi"),
          packager: this.packager,
        })
      }

      const packagePrefix = `${this.appName}-${convertVersion(version)}-`
      await packager.emitArtifactCreated({
        file: path.join(installerOutDir, `${packagePrefix}full.nupkg`),
        target: this,
        arch,
        packager,
      })
      if (distOptions.remoteReleases != null) {
        await packager.emitArtifactCreated({
          file: path.join(installerOutDir, `${packagePrefix}delta.nupkg`),
          target: this,
          arch,
          packager,
        })
      }

      await packager.emitArtifactCreated({
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
    const name = this.packager.appInfo.productFilename || this.options.name || this.packager.appInfo.productName
    return sanitizeFileName(name)
  }

  private select7zipArch(vendorDirectory: string) {
    // https://github.com/electron/windows-installer/blob/main/script/select-7z-arch.js
    // Even if we're cross-compiling for a different arch like arm64,
    // we still need to use the 7-Zip executable for the host arch.
    // When arch-specific variants aren't present (vendor bundle ships a pre-selected 7z.exe),
    // skip the copy — the bundle's 7z.exe is already correct.
    const resolvedArch = os.arch()
    const archExe = path.join(vendorDirectory, `7z-${resolvedArch}.exe`)
    const archDll = path.join(vendorDirectory, `7z-${resolvedArch}.dll`)
    if (fs.existsSync(archExe)) {
      fs.copyFileSync(archExe, path.join(vendorDirectory, "7z.exe"))
    }
    if (fs.existsSync(archDll)) {
      fs.copyFileSync(archDll, path.join(vendorDirectory, "7z.dll"))
    }
  }

  private async createNuspecTemplateWithProjectUrl() {
    const templatePath = path.resolve(import.meta.dirname, "..", "template.nuspectemplate")
    const projectUrl = await this.packager.appInfo.computePackageUrl()
    if (projectUrl != null) {
      const nuspecTemplate = await this.packager.tempDirManager.getTempFile({ prefix: "template", suffix: ".nuspectemplate" })
      let templateContent = await fs.promises.readFile(templatePath, "utf8")
      const searchString = "<copyright><%- copyright %></copyright>"
      templateContent = templateContent.replace(searchString, `${searchString}\n    <projectUrl>${projectUrl}</projectUrl>`)
      await fs.promises.writeFile(nuspecTemplate, templateContent)
      return nuspecTemplate
    }
    return templatePath
  }

  async computeEffectiveDistOptions(appDirectory: string, outputDirectory: string, setupFile: string): Promise<InstallerOptions> {
    const packager = this.packager
    let iconUrl = this.options.iconUrl
    if (iconUrl == null) {
      const info = await packager.repositoryInfo
      if (info != null) {
        iconUrl = `https://github.com/${info.user}/${info.project}/blob/master/${packager.relativeBuildResourcesDirname}/icon.ico?raw=true`
      }

      if (iconUrl == null) {
        throw new InvalidConfigurationError("squirrelWindows.iconUrl is not specified, please see https://www.electron.build/squirrel-windows#SquirrelWindowsOptions-iconUrl")
      }
    }

    normalizeSquirrelOptions(this.options)
    const appInfo = packager.appInfo

    const description = isEmptyOrSpaces(appInfo.description) ? this.options.name || appInfo.productName : appInfo.description

    let remoteReleases: string | undefined
    if (this.options.remoteReleases === true) {
      const info = await packager.repositoryInfo
      if (info == null) {
        log.warn("remoteReleases set to true, but cannot get repository info")
      } else {
        remoteReleases = `https://github.com/${info.user}/${info.project}`
        log.info({ remoteReleases }, `remoteReleases is set`)
      }
    } else if (typeof this.options.remoteReleases === "string" && !isEmptyOrSpaces(this.options.remoteReleases)) {
      remoteReleases = this.options.remoteReleases
    }

    let loadingGif: string
    if (this.options.loadingGif) {
      loadingGif = path.resolve(packager.projectDir, this.options.loadingGif)
    } else {
      // User-supplied buildResources gif wins; otherwise fall back to the bundled default spinner —
      // parity with electron-winstaller, which always supplied resources/install-spinner.gif when none
      // was configured (a fresh-install progress animation; never omitted).
      loadingGif = (await packager.getResource(undefined, "install-spinner.gif")) ?? path.resolve(import.meta.dirname, "..", "install-spinner.gif")
    }

    const vendorDirectory = await this.prepareSignedVendorDirectory()
    this.select7zipArch(vendorDirectory)

    return {
      appDirectory,
      outputDirectory,
      vendorDirectory,
      name: this.options.useAppIdAsId ? appInfo.id : this.appName,
      title: appInfo.productName || appInfo.name,
      version: appInfo.version,
      description,
      exe: `${this.exeName}.exe`,
      authors: appInfo.companyName || "",
      nuspecTemplate: await this.createNuspecTemplateWithProjectUrl(),
      iconUrl,
      copyright: appInfo.copyright,
      msi: this.options.msi,
      fixUpPaths: true,
      setupExe: setupFile,
      setupMsi: this.options.msi ? setupFile.replace(".exe", ".msi") : undefined,
      loadingGif,
      remoteReleases,
      remoteToken: this.options.remoteToken ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN,
      createTempDir: opts => this.packager.tempDirManager.createTempDir(opts),
    }
  }
}

function normalizeSquirrelOptions(options: any) {
  for (const name of ["outputDirectory", "appDirectory", "exe", "fixUpPaths", "usePackageJson", "extraFileSpecs", "extraMetadataSpecs", "skipUpdateIcon", "setupExe"]) {
    if (name in options) {
      throw new InvalidConfigurationError(`Option ${name} is ignored, do not specify it.`)
    }
  }

  const msi = options.msi
  if (msi != null && typeof msi !== "boolean") {
    throw new InvalidConfigurationError(`msi expected to be boolean value, but string '"${msi}"' was specified`)
  }
}
