import { AppMetadata, DevMetadata, Platform, PlatformSpecificBuildOptions, Arch, FileAssociation, BuildMetadata } from "./metadata"
import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"
import { readdir, remove, rename } from "fs-extra-p"
import { use, isEmptyOrSpaces, asArray, debug, getDirectoriesConfig } from "./util/util"
import { Packager } from "./packager"
import { AsarOptions } from "asar-electron-builder"
import { Minimatch } from "minimatch"
import { checkFileInArchive, createAsarArchive } from "./asarUtil"
import { warn, log } from "./util/log"
import { AppInfo } from "./appInfo"
import { unpackElectron } from "./packager/dirPackager"
import { TmpDir } from "./util/tmp"
import { FileMatchOptions, FileMatcher, FilePattern, deprecatedUserIgnoreFilter } from "./fileMatcher"
import { BuildOptions } from "./builder"
import { PublishConfiguration, GithubOptions, BintrayOptions, GenericServerOptions } from "./options/publishOptions"
import { getRepositoryInfo } from "./repositoryInfo"
import { dependencies } from "./yarn"
import { Target } from "./targets/targetFactory"
import { deepAssign } from "./util/deepAssign"
import { statOrNull, unlinkIfExists, copyDir } from "./util/fs"
import EventEmitter = NodeJS.EventEmitter

export interface PackagerOptions {
  targets?: Map<Platform, Map<Arch, string[]>>

  projectDir?: string | null

  cscLink?: string | null
  cscKeyPassword?: string | null

  cscInstallerLink?: string | null
  cscInstallerKeyPassword?: string | null

  platformPackagerFactory?: ((packager: Packager, platform: Platform, cleanupTasks: Array<() => Promise<any>>) => PlatformPackager<any>) | null

  /**
   * The same as [development package.json](https://github.com/electron-userland/electron-builder/wiki/Options#development-packagejson).
   *
   * Development `package.json` will be still read, but options specified in this object will override.
   */
  readonly devMetadata?: DevMetadata

  /*
   See [.build](#BuildMetadata).
   */
  readonly config?: BuildMetadata

  /**
   * The same as [application package.json](https://github.com/electron-userland/electron-builder/wiki/Options#AppMetadata).
   *
   * Application `package.json` will be still read, but options specified in this object will override.
   */
  readonly appMetadata?: AppMetadata

  readonly effectiveOptionComputed?: (options: any) => Promise<boolean>

  readonly extraMetadata?: any
}

export interface BuildInfo {
  options: BuildOptions

  metadata: AppMetadata

  devMetadata: DevMetadata

  config: BuildMetadata

  projectDir: string
  appDir: string
  devPackageFile: string

  electronVersion: string

  eventEmitter: EventEmitter

  isTwoPackageJsonProjectLayoutUsed: boolean

  // computed final effective appId
  appInfo: AppInfo

  readonly tempDirManager: TmpDir
}

export abstract class PlatformPackager<DC extends PlatformSpecificBuildOptions> {
  readonly options: PackagerOptions

  readonly projectDir: string
  readonly buildResourcesDir: string

  readonly config: BuildMetadata

  readonly platformSpecificBuildOptions: DC

  readonly resourceList: Promise<Array<string>>

  abstract get platform(): Platform

  readonly appInfo: AppInfo

  constructor(readonly info: BuildInfo) {
    this.config = info.config
    this.platformSpecificBuildOptions = this.normalizePlatformSpecificBuildOptions((<any>this.config)[this.platform.buildConfigurationKey])
    this.appInfo = this.prepareAppInfo(info.appInfo)
    this.options = info.options
    this.projectDir = info.projectDir

    this.buildResourcesDir = path.resolve(this.projectDir, this.relativeBuildResourcesDirname)

    this.resourceList = readdir(this.buildResourcesDir)
      .catch(e => {
        if (e.code !== "ENOENT") {
          throw e
        }
        return []
      })
  }

  abstract get defaultTarget(): Array<string>

  protected prepareAppInfo(appInfo: AppInfo) {
    return appInfo
  }

  normalizePlatformSpecificBuildOptions(options: DC | n): DC {
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
    return this.options.cscKeyPassword || process.env.CSC_KEY_PASSWORD
  }

  get relativeBuildResourcesDirname() {
    return use(getDirectoriesConfig(this.info.devMetadata), it => it!.buildResources) || "build"
  }

  protected computeAppOutDir(outDir: string, arch: Arch): string {
    return path.join(outDir, `${this.platform.buildConfigurationKey}${getArchSuffix(arch)}${this.platform === Platform.MAC ? "" : "-unpacked"}`)
  }

  dispatchArtifactCreated(file: string, artifactName?: string) {
    this.info.eventEmitter.emit("artifactCreated", {
      file: file,
      artifactName: artifactName,
      packager: this,
    })
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    const appOutDir = this.computeAppOutDir(outDir, arch)
    await this.doPack(outDir, appOutDir, this.platform.nodeName, arch, this.platformSpecificBuildOptions)
    this.packageInDistributableFormat(appOutDir, arch, targets, postAsyncTasks)
  }

  protected packageInDistributableFormat(appOutDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): void {
    postAsyncTasks.push(BluebirdPromise.map(targets, it => it.isAsyncSupported ? it.build(appOutDir, arch) : null)
      .then(() => BluebirdPromise.each(targets, it => it.isAsyncSupported ? null : it.build(appOutDir, arch))))
  }

  private getExtraFileMatchers(isResources: boolean, appOutDir: string, fileMatchOptions: FileMatchOptions, customBuildOptions: DC): Array<FileMatcher> | null {
    const base = isResources ? this.getResourcesDir(appOutDir) : (this.platform === Platform.MAC ? path.join(appOutDir, `${this.appInfo.productFilename}.app`, "Contents") : appOutDir)
    return this.getFileMatchers(isResources ? "extraResources" : "extraFiles", this.projectDir, base, true, fileMatchOptions, customBuildOptions)
  }

  protected async doPack(outDir: string, appOutDir: string, platformName: string, arch: Arch, platformSpecificBuildOptions: DC) {
    const asarOptions = this.computeAsarOptions(platformSpecificBuildOptions)
    const fileMatchOptions: FileMatchOptions = {
      arch: Arch[arch],
      os: this.platform.buildConfigurationKey
    }

    const extraResourceMatchers = this.getExtraFileMatchers(true, appOutDir, fileMatchOptions, platformSpecificBuildOptions)
    const extraFileMatchers = this.getExtraFileMatchers(false, appOutDir, fileMatchOptions, platformSpecificBuildOptions)

    const resourcesPath = this.platform === Platform.MAC ? path.join(appOutDir, "Electron.app", "Contents", "Resources") : path.join(appOutDir, "resources")

    log(`Packaging for ${platformName} ${Arch[arch]} using electron ${this.info.electronVersion} to ${path.relative(this.projectDir, appOutDir)}`)

    const appDir = this.info.appDir
    const ignoreFiles = new Set([path.resolve(appDir, outDir), path.resolve(appDir, this.buildResourcesDir)])
    // prune dev or not listed dependencies
    await BluebirdPromise.all([
      dependencies(appDir, true, ignoreFiles),
      unpackElectron(this, appOutDir, platformName, Arch[arch], this.info.electronVersion),
    ])

    if (debug.enabled) {
      const nodeModulesDir = path.join(appDir, "node_modules")
      debug(`Dev or extraneous dependencies: ${Array.from(ignoreFiles).slice(2).map(it => path.relative(nodeModulesDir, it)).join(", ")}`)
    }

    const patterns = this.getFileMatchers("files", appDir, path.join(resourcesPath, "app"), false, fileMatchOptions, platformSpecificBuildOptions)
    const defaultMatcher = patterns == null ? new FileMatcher(appDir, path.join(resourcesPath, "app"), fileMatchOptions) : patterns[0]
    if (defaultMatcher.isEmpty() || defaultMatcher.containsOnlyIgnore()) {
      defaultMatcher.addAllPattern()
    }
    else {
      defaultMatcher.addPattern("package.json")
    }
    defaultMatcher.addPattern("!**/node_modules/*/{CHANGELOG.md,ChangeLog,changelog.md,README.md,README,readme.md,readme,test,__tests__,tests,powered-test,example,examples,*.d.ts}")
    defaultMatcher.addPattern("!**/node_modules/.bin")
    defaultMatcher.addPattern("!**/*.{o,hprof,orig,pyc,pyo,rbc,swp}")
    defaultMatcher.addPattern("!**/._*")
    defaultMatcher.addPattern("!*.iml")
    //noinspection SpellCheckingInspection
    defaultMatcher.addPattern("!**/{.git,.hg,.svn,CVS,RCS,SCCS," +
      "__pycache__,.DS_Store,thumbs.db,.gitignore,.gitattributes," +
      ".editorconfig,.flowconfig,.jshintrc," +
      ".yarn-integrity,.yarn-metadata.json,yarn-error.log,yarn.lock,npm-debug.log," +
      ".idea," +
      "appveyor.yml,.travis.yml,circle.yml," +
      ".nyc_output}")

    let rawFilter: any = null
    const deprecatedIgnore = (<any>this.config).ignore
    if (deprecatedIgnore != null) {
      if (typeof deprecatedIgnore === "function") {
        warn(`"ignore" is specified as function, may be new "files" option will be suit your needs? Please see https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-files`)
      }
      else {
        warn(`"ignore" is deprecated, please use "files", see https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-files`)
      }
      rawFilter = deprecatedUserIgnoreFilter(deprecatedIgnore, appDir)
    }

    let excludePatterns: Array<Minimatch> = []
    if (extraResourceMatchers != null) {
      for (let i = 0; i < extraResourceMatchers.length; i++) {
        const patterns = extraResourceMatchers[i].getParsedPatterns(this.info.projectDir)
        excludePatterns = excludePatterns.concat(patterns)
      }
    }
    if (extraFileMatchers != null) {
      for (let i = 0; i < extraFileMatchers.length; i++) {
        const patterns = extraFileMatchers[i].getParsedPatterns(this.info.projectDir)
        excludePatterns = excludePatterns.concat(patterns)
      }
    }

    const filter = defaultMatcher.createFilter(ignoreFiles, rawFilter, excludePatterns.length ? excludePatterns : null)
    let promise
    if (asarOptions == null) {
      promise = copyDir(appDir, path.join(resourcesPath, "app"), filter)
    }
    else {
      const unpackPattern = this.getFileMatchers("asarUnpack", appDir, path.join(resourcesPath, "app"), false, fileMatchOptions, platformSpecificBuildOptions)
      const fileMatcher = unpackPattern == null ? null : unpackPattern[0]
      promise = createAsarArchive(appDir, resourcesPath, asarOptions, filter, fileMatcher == null ? null : fileMatcher.createFilter())
    }

    //noinspection ES6MissingAwait
    const promises = [promise, unlinkIfExists(path.join(resourcesPath, "default_app.asar")), unlinkIfExists(path.join(appOutDir, "version")), this.postInitApp(appOutDir)]
    if (this.platform !== Platform.MAC) {
      promises.push(rename(path.join(appOutDir, "LICENSE"), path.join(appOutDir, "LICENSE.electron.txt")).catch(() => {/* ignore */}))
    }
    if (this.info.electronVersion != null && this.info.electronVersion[0] === "0") {
      // electron release >= 0.37.4 - the default_app/ folder is a default_app.asar file
      promises.push(remove(path.join(resourcesPath, "default_app")))
    }

    await BluebirdPromise.all(promises)

    if (platformName === "darwin" || platformName === "mas") {
      await (<any>require("./packager/mac")).createApp(this, appOutDir)
    }

    await this.doCopyExtraFiles(extraResourceMatchers)
    await this.doCopyExtraFiles(extraFileMatchers)

    const afterPack = this.config.afterPack
    if (afterPack != null) {
      await afterPack({
        appOutDir: appOutDir,
        options: this.config,
        packager: this,
      })
    }

    await this.sanityCheckPackage(appOutDir, asarOptions != null)
  }

  protected async postInitApp(executableFile: string): Promise<any> {
  }

  async getIconPath(): Promise<string | null> {
    return null
  }

  private computeAsarOptions(customBuildOptions: DC): AsarOptions | null {
    function errorMessage(name: string) {
      return `${name} is deprecated is deprecated and not supported — please use build.asarUnpack`
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
      warn("Packaging using asar archive is disabled — it is strongly not recommended.\n" +
        "Please enable asar and use asarUnpack to unpack files that must be externally available.")
      return null
    }

    const defaultOptions = {
      extraMetadata: this.options.extraMetadata,
    }

    if (result == null || result === true) {
      return defaultOptions
    }

    for (const name of ["unpackDir", "unpack"]) {
      if ((<any>result)[name] != null) {
        throw new Error(errorMessage(`asar.${name}`))
      }
    }
    return deepAssign({}, result, defaultOptions)
  }

  private doCopyExtraFiles(patterns: Array<FileMatcher> | null): Promise<any> {
    if (patterns == null || patterns.length === 0) {
      return BluebirdPromise.resolve()
    }

    return BluebirdPromise.map(patterns, pattern => {
      if (pattern.isEmpty() || pattern.containsOnlyIgnore()) {
        pattern.addAllPattern()
      }
      return copyDir(pattern.from, pattern.to, pattern.createFilter())
    })
  }

  private getFileMatchers(name: "files" | "extraFiles" | "extraResources" | "asarUnpack", defaultSrc: string, defaultDest: string, allowAdvancedMatching: boolean, fileMatchOptions: FileMatchOptions, customBuildOptions: DC): Array<FileMatcher> | null {
    const globalPatterns: Array<string | FilePattern> | string | n | FilePattern = (<any>this.config)[name]
    const platformSpecificPatterns: Array<string | FilePattern> | string | n = (<any>customBuildOptions)[name]

    const defaultMatcher = new FileMatcher(defaultSrc, defaultDest, fileMatchOptions)
    const fileMatchers: Array<FileMatcher> = []

    function addPatterns(patterns: Array<string | FilePattern> | string | n | FilePattern) {
      if (patterns == null) {
        return
      }
      else if (!Array.isArray(patterns)) {
        if (typeof patterns === "string") {
          defaultMatcher.addPattern(patterns)
          return
        }
        patterns = [patterns]
      }

      for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i]
        if (typeof pattern === "string") {
          defaultMatcher.addPattern(pattern)
        }
        else if (allowAdvancedMatching) {
          const from = pattern.from ? (path.isAbsolute(pattern.from) ? pattern.from : path.join(defaultSrc, pattern.from)) : defaultSrc
          const to = pattern.to ? (path.isAbsolute(pattern.to) ? pattern.to : path.join(defaultDest, pattern.to)) : defaultDest
          fileMatchers.push(new FileMatcher(from, to, fileMatchOptions, pattern.filter))
        }
        else {
          throw new Error(`Advanced file copying not supported for "${name}"`)
        }
      }
    }

    addPatterns(globalPatterns)
    addPatterns(platformSpecificPatterns)

    if (!defaultMatcher.isEmpty()) {
      // Default matcher should be first in the array
      fileMatchers.unshift(defaultMatcher)
    }

    return fileMatchers.length === 0 ? null : fileMatchers
  }

  private getResourcesDir(appOutDir: string): string {
    return this.platform === Platform.MAC ? this.getOSXResourcesDir(appOutDir) : path.join(appOutDir, "resources")
  }

  private getOSXResourcesDir(appOutDir: string): string {
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
      else if (!outStat.isFile()) {
        throw new Error(`${messagePrefix} "${relativeFile}" is not a file. Seems like a wrong configuration.`)
      }
    }
  }

  private async sanityCheckPackage(appOutDir: string, isAsar: boolean): Promise<any> {
    const outStat = await statOrNull(appOutDir)
    if (outStat == null) {
      throw new Error(`Output directory "${appOutDir}" does not exist. Seems like a wrong configuration.`)
    }
    else if (!outStat.isDirectory()) {
      throw new Error(`Output directory "${appOutDir}" is not a directory. Seems like a wrong configuration.`)
    }

    const resourcesDir = this.getResourcesDir(appOutDir)
    await this.checkFileInPackage(resourcesDir, this.appInfo.metadata.main || "index.js", "Application entry file", isAsar)
    await this.checkFileInPackage(resourcesDir, "package.json", "Application", isAsar)
  }

  generateName(ext: string | null, arch: Arch, deployment: boolean, classifier: string | null = null): string {
    let c: string | null = null
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
    else {
      c = Arch[arch]
    }

    if (c == null) {
      c = classifier
    }
    else if (classifier != null) {
      c += `-${classifier}`
    }
    return this.generateName2(ext, c, deployment)
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

  getFileAssociations(): Array<FileAssociation> {
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
    else if (!isEmptyOrSpaces(custom)) {
      return path.resolve(this.projectDir, custom)
    }
    return null
  }
}

export function getArchSuffix(arch: Arch): string {
  return arch === Arch.x64 ? "" : `-${Arch[arch]}`
}

export interface ArtifactCreated {
  readonly packager: PlatformPackager<any>

  readonly file?: string
  readonly data?: Buffer

  readonly artifactName?: string

  readonly publishConfig?: PublishConfiguration
}

// fpm bug - rpm build --description is not escaped, well... decided to replace quite to smart quote
// http://leancrew.com/all-this/2010/11/smart-quotes-in-javascript/
export function smarten(s: string): string {
  // opening singles
  s = s.replace(/(^|[-\u2014\s(\["])'/g, "$1\u2018")
  // closing singles & apostrophes
  s = s.replace(/'/g, "\u2019")
  // opening doubles
  s = s.replace(/(^|[-\u2014/\[(\u2018\s])"/g, "$1\u201c")
  // closing doubles
  s = s.replace(/"/g, "\u201d")
  return s
}

// remove leading dot
export function normalizeExt(ext: string) {
  return ext.startsWith(".") ? ext.substring(1) : ext
}

export function getPublishConfigs(packager: PlatformPackager<any>, platformSpecificBuildOptions: PlatformSpecificBuildOptions): Array<PublishConfiguration> | null {
  // check build.nsis (target)
  let publishers = platformSpecificBuildOptions.publish
  // if explicitly set to null - do not publish
  if (publishers === null) {
    return null
  }

  // check build.win (platform)
  if (packager.platformSpecificBuildOptions !== platformSpecificBuildOptions) {
    publishers = packager.platformSpecificBuildOptions.publish
    if (publishers === null) {
      return null
    }
  }

  if (publishers == null) {
    publishers = packager.config.publish
    if (publishers === null) {
      return null
    }

    if (publishers == null && !isEmptyOrSpaces(process.env.GH_TOKEN)) {
      publishers = [{provider: "github"}]
    }
    // if both tokens are set — still publish to github (because default publisher is github)
    if (publishers == null && !isEmptyOrSpaces(process.env.BT_TOKEN)) {
      publishers = [{provider: "bintray"}]
    }
  }

  return asArray<PublishConfiguration | string>(publishers)
    .map(it => typeof it === "string" ? {provider: <any>it} : it)
}

export async function getResolvedPublishConfig(packager: BuildInfo, publishConfig: PublishConfiguration | GithubOptions | BintrayOptions | GenericServerOptions, errorIfCannot: boolean): Promise<PublishConfiguration | null> {
  if (publishConfig.provider === "generic") {
    if ((<GenericServerOptions>publishConfig).url == null) {
      throw new Error(`Please specify "url" for "generic" update server`)
    }
    return publishConfig
  }

  async function getInfo() {
    const info = await getRepositoryInfo(packager.metadata, packager.devMetadata)
    if (info != null) {
      return info
    }

    if (!errorIfCannot) {
      return null
    }

    warn("Cannot detect repository by .git/config")
    throw new Error(`Please specify "repository" in the dev package.json ('${packager.devPackageFile}').\nPlease see https://github.com/electron-userland/electron-builder/wiki/Publishing-Artifacts`)
  }

  let owner = publishConfig.owner
  let project = publishConfig.provider === "github" ? (<GithubOptions>publishConfig).repo : (<BintrayOptions>publishConfig).package
  if (!owner || !project) {
    const info = await getInfo()
    if (info == null) {
      return null
    }

    if (!owner) {
      owner = info.user
    }
    if (!project) {
      project = info.project
    }
  }

  const copy: PublishConfiguration = Object.assign({}, publishConfig)
  if (copy.owner == null) {
    copy.owner = owner
  }

  if (publishConfig.provider === "github") {
    const options = <GithubOptions>copy
    if (options.repo == null) {
      options.repo = project
    }
    return options
  }
  else if (publishConfig.provider === "bintray") {
    const options = <BintrayOptions>copy
    if (options.package == null) {
      options.package = project
    }
    return options
  }
  else {
    return null
  }
}

export function toDebArch(arch: Arch) {
  return arch === Arch.ia32 ? "i386" : "amd64"
}