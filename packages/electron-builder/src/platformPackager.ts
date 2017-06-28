import { computeData } from "asar-integrity"
import BluebirdPromise from "bluebird-lst"
import { asArray, isEmptyOrSpaces, Lazy, log, use, warn } from "electron-builder-util"
import { deepAssign } from "electron-builder-util/out/deepAssign"
import { copyDir, statOrNull, unlinkIfExists } from "electron-builder-util/out/fs"
import { orIfFileNotExist } from "electron-builder-util/out/promise"
import { readdir, rename } from "fs-extra-p"
import { Minimatch } from "minimatch"
import * as path from "path"
import { AppInfo } from "./appInfo"
import { Arch, getArchSuffix, Platform, Target, TargetSpecificOptions } from "./core"
import { copyFiles, createFileMatcher, FileMatcher, getFileMatchers } from "./fileMatcher"
import { createTransformer, isElectronCompileUsed } from "./fileTransformer"
import { AfterPackContext, AsarOptions, Config, FileAssociation, PlatformSpecificBuildOptions } from "./metadata"
import { unpackElectron, unpackMuon } from "./packager/dirPackager"
import { BuildInfo, PackagerOptions } from "./packagerApi"
import { AsarPackager, checkFileInArchive, ELECTRON_COMPILE_SHIM_FILENAME } from "./util/asarUtil"
import { AsyncTaskManager } from "./util/asyncTaskManager"
import { dependencies } from "./util/packageDependencies"

export abstract class PlatformPackager<DC extends PlatformSpecificBuildOptions> {
  readonly packagerOptions: PackagerOptions

  readonly projectDir: string
  readonly buildResourcesDir: string

  readonly config: Config

  readonly platformSpecificBuildOptions: DC

  get resourceList(): Promise<Array<string>> {
    return this._resourceList.value
  }

  private readonly _resourceList = new Lazy<Array<string>>(() => orIfFileNotExist(readdir(this.buildResourcesDir), []))

  abstract get platform(): Platform

  readonly appInfo: AppInfo

  constructor(readonly info: BuildInfo) {
    this.config = info.config
    this.platformSpecificBuildOptions = PlatformPackager.normalizePlatformSpecificBuildOptions((<any>this.config)[this.platform.buildConfigurationKey])
    this.appInfo = this.prepareAppInfo(info.appInfo)
    this.packagerOptions = info.options
    this.projectDir = info.projectDir

    this.buildResourcesDir = path.resolve(this.projectDir, this.relativeBuildResourcesDirname)
  }

  abstract get defaultTarget(): Array<string>

  protected prepareAppInfo(appInfo: AppInfo) {
    return appInfo
  }

  private static normalizePlatformSpecificBuildOptions(options: any | n): any {
    return options == null ? Object.create(null) : options
  }

  abstract createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void): void

  protected getCscPassword(): string {
    const password = this.doGetCscPassword()
    if (isEmptyOrSpaces(password)) {
      log("CSC_KEY_PASSWORD is not defined, empty password will be used")
      return ""
    }
    else {
      return password!.trim()
    }
  }

  protected doGetCscPassword(): string | undefined {
    const cscKeyPassword = this.packagerOptions.cscKeyPassword
    // allow to specify as empty string
    return cscKeyPassword == null ? process.env.CSC_KEY_PASSWORD : cscKeyPassword
  }

  get relativeBuildResourcesDirname() {
    return use(this.config.directories, it => it!.buildResources) || "build"
  }

  protected computeAppOutDir(outDir: string, arch: Arch): string {
    return this.packagerOptions.prepackaged || path.join(outDir, `${this.platform.buildConfigurationKey}${getArchSuffix(arch)}${this.platform === Platform.MAC ? "" : "-unpacked"}`)
  }

  dispatchArtifactCreated(file: string, target: Target | null, arch: Arch | null, safeArtifactName?: string) {
    this.info.dispatchArtifactCreated({
      file, safeArtifactName, target, arch,
      packager: this,
    })
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, taskManager: AsyncTaskManager): Promise<any> {
    const appOutDir = this.computeAppOutDir(outDir, arch)
    await this.doPack(outDir, appOutDir, this.platform.nodeName, arch, this.platformSpecificBuildOptions, targets)
    this.packageInDistributableFormat(appOutDir, arch, targets, taskManager)
  }

  protected packageInDistributableFormat(appOutDir: string, arch: Arch, targets: Array<Target>, taskManager: AsyncTaskManager): void {
    taskManager.addTask(BluebirdPromise.map(targets, it => it.isAsyncSupported ? it.build(appOutDir, arch) : null)
      .then(() => BluebirdPromise.each(targets, it => it.isAsyncSupported ? null : it.build(appOutDir, arch))))
  }

  private getExtraFileMatchers(isResources: boolean, appOutDir: string, macroExpander: (pattern: string) => string, customBuildOptions: DC): Array<FileMatcher> | null {
    const base = isResources ? this.getResourcesDir(appOutDir) : (this.platform === Platform.MAC ? path.join(appOutDir, `${this.appInfo.productFilename}.app`, "Contents") : appOutDir)
    return getFileMatchers(this.config, isResources ? "extraResources" : "extraFiles", this.projectDir, base, true, macroExpander, customBuildOptions)
  }

  get electronDistMacOsAppName() {
    return this.config.muonVersion == null ? "Electron.app" : "Brave.app"
  }

  get electronDistExecutableName() {
    return this.config.muonVersion == null ? "electron" : "brave"
  }

  get electronDistMacOsExecutableName() {
    return this.config.muonVersion == null ? "Electron" : "Brave"
  }

  protected async doPack(outDir: string, appOutDir: string, platformName: string, arch: Arch, platformSpecificBuildOptions: DC, targets: Array<Target>) {
    if (this.packagerOptions.prepackaged != null) {
      return
    }

    const asarOptions = await this.computeAsarOptions(platformSpecificBuildOptions)
    const macroExpander = (it: string) => this.expandMacro(it, arch == null ? null : Arch[arch], {"/*": "{,/**/*}"})
    const extraResourceMatchers = this.getExtraFileMatchers(true, appOutDir, macroExpander, platformSpecificBuildOptions)
    const extraFileMatchers = this.getExtraFileMatchers(false, appOutDir, macroExpander, platformSpecificBuildOptions)

    const resourcesPath = this.platform === Platform.MAC ? path.join(appOutDir, this.electronDistMacOsAppName, "Contents", "Resources") : path.join(appOutDir, "resources")

    const muonVersion = this.config.muonVersion
    const isElectron = muonVersion == null
    const config = this.config
    log(`Packaging for ${platformName} ${Arch[arch]} using ${isElectron ? `electron ${config.electronVersion}` : `muon ${muonVersion}`} to ${path.relative(this.projectDir, appOutDir)}`)

    const appDir = this.info.appDir
    const ignoreFiles = new Set()
    if (this.info.isPrepackedAppAsar) {
      await unpackElectron(this, appOutDir, platformName, Arch[arch], config.electronVersion!)
    }
    else {
      await (isElectron ? unpackElectron(this, appOutDir, platformName, Arch[arch], config.electronVersion!) : unpackMuon(this, appOutDir, platformName, Arch[arch], muonVersion!))

      if (asarOptions == null) {
        await dependencies(appDir, ignoreFiles)
      }
    }

    let rawFilter: any = null
    const excludePatterns: Array<Minimatch> = []
    if (extraResourceMatchers != null) {
      for (const matcher of extraResourceMatchers) {
        matcher.computeParsedPatterns(excludePatterns, this.info.projectDir)
      }
    }
    if (extraFileMatchers != null) {
      for (const matcher of extraFileMatchers) {
        matcher.computeParsedPatterns(excludePatterns, this.info.projectDir)
      }
    }

    const packContext: AfterPackContext = {
      appOutDir, outDir, arch, targets,
      packager: this,
      electronPlatformName: platformName,
    }

    const defaultMatcher = createFileMatcher(appDir, resourcesPath, macroExpander, platformSpecificBuildOptions, this, outDir)
    const isElectronCompile = asarOptions != null && isElectronCompileUsed(this.info)
    if (isElectronCompile) {
      defaultMatcher.addPattern("!.cache{,/**/*}")
    }

    const filter = defaultMatcher.createFilter(ignoreFiles, rawFilter, excludePatterns.length > 0 ? excludePatterns : null)

    const transformer = await createTransformer(appDir, isElectronCompile ? Object.assign({
      originalMain: this.info.metadata.main,
      main: ELECTRON_COMPILE_SHIM_FILENAME,
    }, config.extraMetadata) : config.extraMetadata)
    const taskManager = new AsyncTaskManager(this.info.cancellationToken)
    if (this.info.isPrepackedAppAsar) {
      taskManager.addTask(copyDir(appDir, path.join(resourcesPath), filter, transformer))
    }
    else if (asarOptions == null) {
      taskManager.addTask(copyDir(appDir, path.join(resourcesPath, "app"), filter, transformer))
    }
    else {
      const unpackPattern = getFileMatchers(config, "asarUnpack", appDir, path.join(resourcesPath, "app"), false, macroExpander, platformSpecificBuildOptions)
      const fileMatcher = unpackPattern == null ? null : unpackPattern[0]
      taskManager.addTask(new AsarPackager(appDir, resourcesPath, asarOptions, fileMatcher == null ? null : fileMatcher.createFilter(), transformer).pack(filter, isElectronCompile, this))
    }

    taskManager.addTask(unlinkIfExists(path.join(resourcesPath, "default_app.asar")))
    taskManager.addTask(unlinkIfExists(path.join(appOutDir, "version")))
    taskManager.addTask(this.postInitApp(packContext))
    if (this.platform !== Platform.MAC) {
      taskManager.addTask(rename(path.join(appOutDir, "LICENSE"), path.join(appOutDir, "LICENSE.electron.txt")).catch(() => {/* ignore */}))
    }

    await taskManager.awaitTasks()

    if (platformName === "darwin" || platformName === "mas") {
      await (<any>require("./packager/mac")).createApp(this, appOutDir, asarOptions == null ? null : await computeData(resourcesPath, asarOptions.externalAllowed ? {externalAllowed: true} : null))
    }

    await copyFiles(extraResourceMatchers)
    await copyFiles(extraFileMatchers)

    if (this.info.cancellationToken.cancelled) {
      return
    }

    await this.info.afterPack(packContext)
    await this.sanityCheckPackage(appOutDir, asarOptions != null)
  }

  protected async postInitApp(packContext: AfterPackContext): Promise<any> {
  }

  async getIconPath(): Promise<string | null> {
    return null
  }

  private async computeAsarOptions(customBuildOptions: DC): Promise<AsarOptions | null> {
    function errorMessage(name: string) {
      return `${name} is deprecated is deprecated and not supported — please use asarUnpack`
    }

    const buildMetadata = <any>this.config
    if (buildMetadata["asar-unpack"] != null) {
      throw new Error(errorMessage("asar-unpack"))
    }
    if (buildMetadata["asar-unpack-dir"] != null) {
      throw new Error(errorMessage("asar-unpack-dir"))
    }

    const platformSpecific = customBuildOptions.asar
    const result = platformSpecific == null ? this.config.asar : platformSpecific
    if (result === false) {
      const appAsarStat = await statOrNull(path.join(this.info.appDir, "app.asar"))
      //noinspection ES6MissingAwait
      if (appAsarStat == null || !appAsarStat.isFile()) {
        warn("Packaging using asar archive is disabled — it is strongly not recommended.\n" +
          "Please enable asar and use asarUnpack to unpack files that must be externally available.")
      }
      return null
    }

    if (result == null || result === true) {
      return {}
    }

    for (const name of ["unpackDir", "unpack"]) {
      if ((<any>result)[name] != null) {
        throw new Error(errorMessage(`asar.${name}`))
      }
    }
    return deepAssign({}, result)
  }

  public getElectronSrcDir(dist: string): string {
    return path.resolve(this.projectDir, dist)
  }

  public getElectronDestinationDir(appOutDir: string): string {
    return appOutDir
  }

  public getResourcesDir(appOutDir: string): string {
    return this.platform === Platform.MAC ? this.getMacOsResourcesDir(appOutDir) : path.join(appOutDir, "resources")
  }

  public getMacOsResourcesDir(appOutDir: string): string {
    return path.join(appOutDir, `${this.appInfo.productFilename}.app`, "Contents", "Resources")
  }

  private async checkFileInPackage(resourcesDir: string, file: string, messagePrefix: string, isAsar: boolean) {
    const relativeFile = path.relative(this.info.appDir, path.resolve(this.info.appDir, file))
    if (isAsar) {
      await checkFileInArchive(path.join(resourcesDir, "app.asar"), relativeFile, messagePrefix)
      return
    }

    const pathParsed = path.parse(file)
    // Even when packaging to asar is disabled, it does not imply that the main file can not be inside an .asar archive.
    // This may occur when the packaging is done manually before processing with electron-builder.
    if (pathParsed.dir.includes(".asar")) {
      // The path needs to be split to the part with an asar archive which acts like a directory and the part with
      // the path to main file itself. (e.g. path/arch.asar/dir/index.js -> path/arch.asar, dir/index.js)
      const pathSplit: Array<string> = pathParsed.dir.split(path.sep)
      let partWithAsarIndex = 0
      pathSplit.some((pathPart: string, index: number) => {
        partWithAsarIndex = index
        return pathPart.endsWith(".asar")
      })
      const asarPath = path.join.apply(path, pathSplit.slice(0, partWithAsarIndex + 1))
      let mainPath = pathSplit.length > (partWithAsarIndex + 1) ? path.join.apply(pathSplit.slice(partWithAsarIndex + 1)) : ""
      mainPath += path.join(mainPath, pathParsed.base)
      await checkFileInArchive(path.join(resourcesDir, "app", asarPath), mainPath, messagePrefix)
    }
    else {
      const outStat = await statOrNull(path.join(resourcesDir, "app", relativeFile))
      if (outStat == null) {
        throw new Error(`${messagePrefix} "${relativeFile}" does not exist. Seems like a wrong configuration.`)
      }
      else {
        //noinspection ES6MissingAwait
        if (!outStat.isFile()) {
          throw new Error(`${messagePrefix} "${relativeFile}" is not a file. Seems like a wrong configuration.`)
        }
      }
    }
  }

  private async sanityCheckPackage(appOutDir: string, isAsar: boolean): Promise<any> {
    const outStat = await statOrNull(appOutDir)
    if (outStat == null) {
      throw new Error(`Output directory "${appOutDir}" does not exist. Seems like a wrong configuration.`)
    }
    else {
      //noinspection ES6MissingAwait
      if (!outStat.isDirectory()) {
        throw new Error(`Output directory "${appOutDir}" is not a directory. Seems like a wrong configuration.`)
      }
    }

    const resourcesDir = this.getResourcesDir(appOutDir)
    await this.checkFileInPackage(resourcesDir, this.info.metadata.main || "index.js", "Application entry file", isAsar)
    await this.checkFileInPackage(resourcesDir, "package.json", "Application", isAsar)
  }

  computeSafeArtifactName(ext: string, arch?: Arch | null, skipArchIfX64 = true) {
    return this.computeArtifactName("${name}-${version}-${arch}.${ext}", ext, skipArchIfX64 && arch === Arch.x64 ? null : arch)
  }

  expandArtifactNamePattern(targetSpecificOptions: TargetSpecificOptions | n, ext: string, arch?: Arch | null, defaultPattern?: string, skipArchIfX64 = true): string {
    let pattern = targetSpecificOptions == null ? null : targetSpecificOptions.artifactName
    if (pattern == null) {
      pattern = this.platformSpecificBuildOptions.artifactName || this.config.artifactName || defaultPattern || "${productName}-${version}-${arch}.${ext}"
    }
    return this.computeArtifactName(pattern, ext, skipArchIfX64 && arch === Arch.x64 ? null : arch)
  }

  private computeArtifactName(pattern: any, ext: string, arch: Arch | null | undefined) {
    let archName: string | null = arch == null ? null : Arch[arch]
    if (arch === Arch.x64) {
      if (ext === "AppImage" || ext === "rpm") {
        archName = "x86_64"
      }
      else if (ext === "deb") {
        archName = "amd64"
      }
    }
    else if (arch === Arch.ia32) {
      if (ext === "deb" || ext === "AppImage") {
        archName = "i386"
      }
      else if (ext === "pacman" || ext === "rpm") {
        archName = "i686"
      }
    }

    return this.expandMacro(pattern, this.platform === Platform.MAC ? null : archName, {
      ext: ext
    })
  }

  expandMacro(pattern: string, arch?: string | null, extra: any = {}, isProductNameSanitized = true): string {
    if (arch == null) {
      pattern = pattern
        .replace("-${arch}", "")
        .replace(" ${arch}", "")
        .replace("_${arch}", "")
        .replace("/${arch}", "")
    }

    const appInfo = this.appInfo
    return pattern.replace(/\${([_a-zA-Z./*]+)}/g, (match, p1): string => {
      switch (p1) {
        case "productName":
          return isProductNameSanitized ? appInfo.productFilename : appInfo.productName

        case "arch":
          if (arch == null) {
            // see above, we remove macro if no arch
            return ""
          }
          return arch

        case "os":
          return this.platform.buildConfigurationKey

        default:
          if (p1 in appInfo) {
            return (<any>appInfo)[p1]
          }

          if (p1.startsWith("env.")) {
            const envName = p1.substring("env.".length)
            const envValue = process.env[envName]
            if (envValue == null) {
              throw new Error(`Env ${envName} is not defined`)
            }
            return envValue
          }

          const value = extra[p1]
          if (value == null) {
            throw new Error(`Macro ${p1} is not defined`)
          }
          else {
            return value
          }
      }
    })
  }

  generateName(ext: string | null, arch: Arch, deployment: boolean, classifier: string | null = null): string {
    let c: string | null = null
    let e: string | null = null
    if (arch === Arch.x64) {
      if (ext === "AppImage") {
        c = "x86_64"
      }
      else if (ext === "deb") {
        c = "amd64"
      }
    }
    else if (arch === Arch.ia32 && ext === "deb") {
      c = "i386"
    }
    else if (ext === "pacman") {
      if (arch === Arch.ia32) {
        c = "i686"
      }
      e = "pkg.tar.xz"
    }
    else {
      c = Arch[arch]
    }

    if (c == null) {
      c = classifier
    }
    else if (classifier != null) {
      c += `-${classifier}`
    }
    if (e == null) {
      e = ext
    }
    return this.generateName2(e, c, deployment)
  }

  generateName2(ext: string | null, classifier: string | n, deployment: boolean): string {
    const dotExt = ext == null ? "" : `.${ext}`
    const separator = ext === "deb" ? "_" : "-"
    return `${deployment ? this.appInfo.name : this.appInfo.productFilename}${separator}${this.appInfo.version}${classifier == null ? "" : `${separator}${classifier}`}${dotExt}`
  }

  async getDefaultIcon(ext: string) {
    const resourceList = await this.resourceList
    const name = `icon.${ext}`
    if (resourceList.includes(name)) {
      return path.join(this.buildResourcesDir, name)
    }
    else {
      warn("Application icon is not set, default Electron icon will be used")
      return null
    }
  }

  getTempFile(suffix: string): Promise<string> {
    return this.info.tempDirManager.getTempFile(suffix)
  }

  get fileAssociations(): Array<FileAssociation> {
    return asArray(this.config.fileAssociations).concat(asArray(this.platformSpecificBuildOptions.fileAssociations))
  }

  async getResource(custom: string | n, ...names: Array<string>): Promise<string | null> {
    if (custom === undefined) {
      const resourceList = await this.resourceList
      for (const name of names) {
        if (resourceList.includes(name)) {
          return path.join(this.buildResourcesDir, name)
        }
      }
    }
    else if (custom != null && !isEmptyOrSpaces(custom)) {
      const resourceList = await this.resourceList
      if (resourceList.includes(custom)) {
        return path.join(this.buildResourcesDir, custom)
      }

      let p = path.resolve(this.buildResourcesDir, custom)
      if (await statOrNull(p) == null) {
        p = path.resolve(this.projectDir, custom)
        if (await statOrNull(p) == null) {
          throw new Error(`Cannot find specified resource "${custom}", nor relative to "${this.buildResourcesDir}", neither relative to project dir ("${this.projectDir}")`)
        }
      }
      return p
    }
    return null
  }

  get forceCodeSigning(): boolean {
    const forceCodeSigningPlatform = this.platformSpecificBuildOptions.forceCodeSigning
    return (forceCodeSigningPlatform == null ? this.config.forceCodeSigning : forceCodeSigningPlatform) || false
  }
}

// remove leading dot
export function normalizeExt(ext: string) {
  return ext.startsWith(".") ? ext.substring(1) : ext
}