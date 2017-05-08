import BluebirdPromise from "bluebird-lst"
import { Arch, AsarOptions, FileAssociation, getArchSuffix, Platform, PlatformSpecificBuildOptions, Target, TargetSpecificOptions } from "electron-builder-core"
import { asArray, debug, isEmptyOrSpaces, Lazy, use } from "electron-builder-util"
import { deepAssign } from "electron-builder-util/out/deepAssign"
import { copyDir, statOrNull, unlinkIfExists } from "electron-builder-util/out/fs"
import { log, warn } from "electron-builder-util/out/log"
import { readdir, rename } from "fs-extra-p"
import { Minimatch } from "minimatch"
import * as path from "path"
import { AppInfo } from "./appInfo"
import { AsarPackager, checkFileInArchive } from "./asarUtil"
import { copyFiles, createFileMatcher, FileMatcher, getFileMatchers } from "./fileMatcher"
import { createTransformer, isElectronCompileUsed } from "./fileTransformer"
import { Config } from "./metadata"
import { unpackElectron, unpackMuon } from "./packager/dirPackager"
import { BuildInfo, PackagerOptions } from "./packagerApi"
import { readInstalled } from "./readInstalled"

export abstract class PlatformPackager<DC extends PlatformSpecificBuildOptions> {
  readonly packagerOptions: PackagerOptions

  readonly projectDir: string
  readonly buildResourcesDir: string

  readonly config: Config

  readonly platformSpecificBuildOptions: DC

  get resourceList(): Promise<Array<string>> {
    return this._resourceList.value
  }

  private readonly _resourceList = new Lazy<Array<string>>(() => {
    return readdir(this.buildResourcesDir)
      .catch(e => {
        if (e.code !== "ENOENT") {
          throw e
        }
        return []
      })
  })

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

  abstract createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void, cleanupTasks: Array<() => Promise<any>>): void

  protected getCscPassword(): string {
    const password = this.doGetCscPassword()
    if (isEmptyOrSpaces(password)) {
      log("CSC_KEY_PASSWORD is not defined, empty password will be used")
      return ""
    }
    else {
      return password.trim()
    }
  }

  protected doGetCscPassword() {
    return this.packagerOptions.cscKeyPassword || process.env.CSC_KEY_PASSWORD
  }

  get relativeBuildResourcesDirname() {
    return use(this.config.directories, it => it!.buildResources) || "build"
  }

  protected computeAppOutDir(outDir: string, arch: Arch): string {
    return this.info.prepackaged || path.join(outDir, `${this.platform.buildConfigurationKey}${getArchSuffix(arch)}${this.platform === Platform.MAC ? "" : "-unpacked"}`)
  }

  dispatchArtifactCreated(file: string, target: Target | null, arch: Arch | null, safeArtifactName?: string) {
    this.info.dispatchArtifactCreated({
      file, safeArtifactName, target, arch,
      packager: this,
    })
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    const appOutDir = this.computeAppOutDir(outDir, arch)
    await this.doPack(outDir, appOutDir, this.platform.nodeName, arch, this.platformSpecificBuildOptions, targets)
    this.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)
  }

  protected packageInDistributableFormat(appOutDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): void {
    postAsyncTasks.push(BluebirdPromise.map(targets, it => it.isAsyncSupported ? it.build(appOutDir, arch) : null)
      .then(() => BluebirdPromise.each(targets, it => it.isAsyncSupported ? null : it.build(appOutDir, arch))))
  }

  private getExtraFileMatchers(isResources: boolean, appOutDir: string, macroExpander: (pattern: string) => string, customBuildOptions: DC): Array<FileMatcher> | null {
    const base = isResources ? this.getResourcesDir(appOutDir) : (this.platform === Platform.MAC ? path.join(appOutDir, `${this.appInfo.productFilename}.app`, "Contents") : appOutDir)
    return getFileMatchers(this.config, isResources ? "extraResources" : "extraFiles", this.projectDir, base, true, macroExpander, customBuildOptions)
  }
  
  get electronDistMacOsAppName() {
    return this.info.muonVersion == null ? "Electron.app" : "Brave.app"
  }
  
  get electronDistExecutableName() {
    return this.info.muonVersion == null ? "electron" : "brave"
  }
  
  get electronDistMacOsExecutableName() {
    return this.info.muonVersion == null ? "Electron" : "Brave"
  }

  protected async doPack(outDir: string, appOutDir: string, platformName: string, arch: Arch, platformSpecificBuildOptions: DC, targets: Array<Target>) {
    if (this.info.prepackaged != null) {
      return
    }

    const asarOptions = await this.computeAsarOptions(platformSpecificBuildOptions)
    const macroExpander = (it: string) => this.expandMacro(it, arch, {"/*": "{,/**/*}"})
    const extraResourceMatchers = this.getExtraFileMatchers(true, appOutDir, macroExpander, platformSpecificBuildOptions)
    const extraFileMatchers = this.getExtraFileMatchers(false, appOutDir, macroExpander, platformSpecificBuildOptions)

    const resourcesPath = this.platform === Platform.MAC ? path.join(appOutDir, this.electronDistMacOsAppName, "Contents", "Resources") : path.join(appOutDir, "resources")

    const muonVersion = this.info.muonVersion
    const isElectron = muonVersion == null
    log(`Packaging for ${platformName} ${Arch[arch]} using ${isElectron ? `electron ${this.info.electronVersion}` : `muon ${muonVersion}`} to ${path.relative(this.projectDir, appOutDir)}`)

    const appDir = this.info.appDir
    const ignoreFiles = new Set([path.resolve(this.info.projectDir, outDir),
      path.resolve(this.info.projectDir, "electron-builder.yml"),
      path.resolve(this.info.projectDir, "electron-builder.json"),
      path.resolve(this.info.projectDir, "electron-builder.json5")])
    if (this.info.isPrepackedAppAsar) {
      await unpackElectron(this, appOutDir, platformName, Arch[arch], this.info.electronVersion)
    }
    else {
      // prune dev or not listed dependencies
      await BluebirdPromise.all([
        dependencies(appDir, ignoreFiles),
        isElectron ? unpackElectron(this, appOutDir, platformName, Arch[arch], this.info.electronVersion) : unpackMuon(this, appOutDir, platformName, Arch[arch], muonVersion!),
      ])

      if (debug.enabled) {
        const nodeModulesDir = path.join(appDir, "node_modules")
        debug(`Dev or extraneous dependencies: ${Array.from(ignoreFiles).slice(2).map(it => path.relative(nodeModulesDir, it)).join(", ")}`)
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

    const defaultMatcher = createFileMatcher(this.info, appDir, resourcesPath, macroExpander, platformSpecificBuildOptions, path.resolve(this.info.projectDir, this.buildResourcesDir))
    const isElectronCompile = asarOptions != null && isElectronCompileUsed(this.info)
    if (isElectronCompile) {
      defaultMatcher.addPattern("!.cache{,/**/*}")
    }
    
    const filter = defaultMatcher.createFilter(ignoreFiles, rawFilter, excludePatterns.length > 0 ? excludePatterns : null)

    const transformer = await createTransformer(appDir, isElectronCompile ? Object.assign({
      originalMain: this.info.metadata.main,
      main: "es6-shim.js",
    }, this.packagerOptions.extraMetadata) : this.packagerOptions.extraMetadata)
    let promise
    if (this.info.isPrepackedAppAsar) {
      promise = copyDir(appDir, path.join(resourcesPath), filter, transformer)
    }
    else if (asarOptions == null) {
      promise = copyDir(appDir, path.join(resourcesPath, "app"), filter, transformer)
    }
    else {
      const unpackPattern = getFileMatchers(this.config, "asarUnpack", appDir, path.join(resourcesPath, "app"), false, macroExpander, platformSpecificBuildOptions)
      const fileMatcher = unpackPattern == null ? null : unpackPattern[0]
      promise = new AsarPackager(appDir, resourcesPath, asarOptions, fileMatcher == null ? null : fileMatcher.createFilter(), transformer).pack(filter, isElectronCompile)
    }

    //noinspection ES6MissingAwait
    const promises = [promise, unlinkIfExists(path.join(resourcesPath, "default_app.asar")), unlinkIfExists(path.join(appOutDir, "version")), this.postInitApp(appOutDir)]
    if (this.platform !== Platform.MAC) {
      promises.push(rename(path.join(appOutDir, "LICENSE"), path.join(appOutDir, "LICENSE.electron.txt")).catch(() => {/* ignore */}))
    }

    await BluebirdPromise.all(promises)

    if (platformName === "darwin" || platformName === "mas") {
      await (<any>require("./packager/mac")).createApp(this, appOutDir)
    }

    await copyFiles(extraResourceMatchers)
    await copyFiles(extraFileMatchers)

    if (this.info.cancellationToken.cancelled) {
      return
    }

    await this.info.afterPack({
      appOutDir: appOutDir,
      packager: this,
      electronPlatformName: platformName,
      arch: arch,
      targets: targets,
    })
    await this.sanityCheckPackage(appOutDir, asarOptions != null)
  }

  protected async postInitApp(executableFile: string): Promise<any> {
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
  
  public getElectronSrcDir(appSrcDir: string): string {
    return this.platform === Platform.MAC ? path.join(this.projectDir, appSrcDir, "Electron.app") : path.join(this.projectDir, appSrcDir)
  }

  public getElectronDestDir(appOutDir: string): string {
    return this.platform === Platform.MAC ? path.join(appOutDir, "Electron.app") : appOutDir
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
    await this.checkFileInPackage(resourcesDir, this.appInfo.metadata.main || "index.js", "Application entry file", isAsar)
    await this.checkFileInPackage(resourcesDir, "package.json", "Application", isAsar)
  }

  expandArtifactNamePattern(targetSpecificOptions: TargetSpecificOptions | n, ext: string, arch?: Arch | null, defaultPattern?: string): string {
    let pattern = targetSpecificOptions == null ? null : targetSpecificOptions.artifactName
    if (pattern == null) {
      pattern = this.platformSpecificBuildOptions.artifactName || this.config.artifactName || defaultPattern || "${productName}-${version}.${ext}"
    }
    return this.expandMacro(pattern, arch, {
      ext: ext
    })
  }

  expandMacro(pattern: string, arch: Arch | n, extra: any = {}): string {
    if (arch == null) {
      pattern = pattern
        .replace("-${arch}", "")
        .replace(" ${arch}", "")
        .replace("_${arch}", "")
        .replace("/${arch}", "")
    }

    const appInfo = this.appInfo
    return pattern.replace(/\$\{([_a-zA-Z./*]+)\}/g, (match, p1): string => {
      switch (p1) {
        case "productName":
          return appInfo.productFilename

        case "arch":
          if (arch == null) {
            // see above, we remove macro if no arch
            return ""
          }
          return Arch[arch]

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

async function dependencies(dir: string, result: Set<string>): Promise<void> {
  const pathToDep = await readInstalled(dir)
  for (const dep of pathToDep.values()) {
    if (dep.extraneous) {
      result.add(dep.path)
    }
  }
}
