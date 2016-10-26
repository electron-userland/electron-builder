import { AppMetadata, DevMetadata, Platform, PlatformSpecificBuildOptions, Arch, FileAssociation } from "./metadata"
import EventEmitter = NodeJS.EventEmitter
import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"
import { readdir, remove } from "fs-extra-p"
import { statOrNull, use, unlinkIfExists, isEmptyOrSpaces, asArray } from "./util/util"
import { Packager } from "./packager"
import { AsarOptions } from "asar-electron-builder"
import { archiveApp } from "./targets/archive"
import { Minimatch } from "minimatch"
import { checkFileInArchive, createAsarArchive } from "./asarUtil"
import { warn, log, task } from "./util/log"
import { AppInfo } from "./appInfo"
import { copyFiltered, devDependencies } from "./util/filter"
import { pack } from "./packager/dirPackager"
import { TmpDir } from "./util/tmp"
import { FileMatchOptions, FileMatcher, FilePattern, deprecatedUserIgnoreFilter } from "./fileMatcher"
import { BuildOptions } from "./builder"
import { PublishConfiguration, GithubOptions, BintrayOptions } from "./options/publishOptions"
import { getRepositoryInfo } from "./repositoryInfo"

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

  /**
   * The same as [application package.json](https://github.com/electron-userland/electron-builder/wiki/Options#AppMetadata).
   *
   * Application `package.json` will be still read, but options specified in this object will override.
   */
  readonly appMetadata?: AppMetadata

  readonly effectiveOptionComputed?: (options: any) => boolean

  readonly extraMetadata?: any
}

export interface BuildInfo {
  options: BuildOptions

  metadata: AppMetadata

  devMetadata: DevMetadata

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

export class Target {
  constructor(public name: string) {
  }

  finishBuild(): Promise<any> {
    return BluebirdPromise.resolve()
  }
}

export abstract class TargetEx extends Target {
  abstract build(appOutDir: string, arch: Arch): Promise<any>
}

export abstract class PlatformPackager<DC extends PlatformSpecificBuildOptions> {
  readonly options: PackagerOptions

  readonly projectDir: string
  readonly buildResourcesDir: string

  readonly devMetadata: DevMetadata

  readonly platformSpecificBuildOptions: DC

  readonly resourceList: Promise<Array<string>>

  abstract get platform(): Platform

  readonly appInfo: AppInfo

  constructor(public info: BuildInfo) {
    this.devMetadata = info.devMetadata
    this.platformSpecificBuildOptions = this.normalizePlatformSpecificBuildOptions((<any>info.devMetadata.build)[this.platform.buildConfigurationKey])
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
    return use(this.devMetadata.directories, it => it!.buildResources) || "build"
  }

  protected computeAppOutDir(outDir: string, arch: Arch): string {
    return path.join(outDir, `${this.platform.buildConfigurationKey}${getArchSuffix(arch)}${this.platform === Platform.MAC ? "" : "-unpacked"}`)
  }

  dispatchArtifactCreated(file: string, artifactName?: string) {
    this.info.eventEmitter.emit("artifactCreated", {
      file: file,
      artifactName: artifactName,
      platform: this.platform,
      packager: this,
    })
  }

  abstract pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any>

  private getExtraFileMatchers(isResources: boolean, appOutDir: string, fileMatchOptions: FileMatchOptions, customBuildOptions: DC): Array<FileMatcher> | n {
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

    const p = pack(this, appOutDir, platformName, Arch[arch], this.info.electronVersion, async() => {
      const ignoreFiles = new Set([path.resolve(this.info.appDir, outDir), path.resolve(this.info.appDir, this.buildResourcesDir)])
      // prune dev or not listed dependencies
      const result = await devDependencies(this.info.appDir)
      for (let it of result) {
        ignoreFiles.add(it)
      }

      const patterns = this.getFileMatchers("files", this.info.appDir, path.join(resourcesPath, "app"), false, fileMatchOptions, platformSpecificBuildOptions)
      let defaultMatcher = patterns != null ? patterns[0] : new FileMatcher(this.info.appDir, path.join(resourcesPath, "app"), fileMatchOptions)

      if (defaultMatcher.isEmpty()) {
        defaultMatcher.addPattern("**/*")
      }
      defaultMatcher.addPattern("!**/node_modules/*/{README.md,README,readme.md,readme,test}")
      defaultMatcher.addPattern("!**/node_modules/.bin")
      defaultMatcher.addPattern("!**/*.{o,hprof,orig,pyc,pyo,rbc,swp}")
      defaultMatcher.addPattern("!**/._*")
      //noinspection SpellCheckingInspection
      defaultMatcher.addPattern("!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,__pycache__,thumbs.db,.gitignore,.gitattributes,.editorconfig,.idea,appveyor.yml,.travis.yml,circle.yml,npm-debug.log}")

      let rawFilter: any = null
      const deprecatedIgnore = (<any>this.devMetadata.build).ignore
      if (deprecatedIgnore != null) {
        if (typeof deprecatedIgnore === "function") {
          log(`"ignore is specified as function, may be new "files" option will be suit your needs? Please see https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-files`)
        }
        else {
          warn(`"ignore is deprecated, please use "files", see https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-files`)
        }
        rawFilter = deprecatedUserIgnoreFilter(deprecatedIgnore, this.info.appDir)
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
      const promise = asarOptions == null ?
        copyFiltered(this.info.appDir, path.join(resourcesPath, "app"), filter, this.info.devMetadata.build.dereference || this.platform === Platform.WINDOWS)
        : createAsarArchive(this.info.appDir, resourcesPath, asarOptions, filter)

      const promises = [promise, unlinkIfExists(path.join(resourcesPath, "default_app.asar")), unlinkIfExists(path.join(appOutDir, "version"))]
      if (this.info.electronVersion != null && this.info.electronVersion[0] === "0") {
        // electron release >= 0.37.4 - the default_app/ folder is a default_app.asar file
        promises.push(remove(path.join(resourcesPath, "default_app")))
      }

      promises.push(this.postInitApp(appOutDir))
      await BluebirdPromise.all(promises)
    })
    await task(`Packaging for platform ${platformName} ${Arch[arch]} using electron ${this.info.electronVersion} to ${path.relative(this.projectDir, appOutDir)}`, p)

    await this.doCopyExtraFiles(extraResourceMatchers)
    await this.doCopyExtraFiles(extraFileMatchers)

    const afterPack = this.devMetadata.build.afterPack
    if (afterPack != null) {
      await afterPack({
        appOutDir: appOutDir,
        options: this.devMetadata.build,
        packager: this,
      })
    }

    await this.sanityCheckPackage(appOutDir, asarOptions != null)
  }

  protected postInitApp(executableFile: string): Promise<any> {
    return BluebirdPromise.resolve(null)
  }

  async getIconPath(): Promise<string | null> {
    return null
  }

  private computeAsarOptions(customBuildOptions: DC): AsarOptions | null {
    let result = this.devMetadata.build.asar
    let platformSpecific = customBuildOptions.asar
    if (platformSpecific != null) {
      result = platformSpecific
    }

    if (result === false) {
      return null
    }

    const buildMetadata = <any>this.devMetadata.build
    if (buildMetadata["asar-unpack"] != null) {
      warn("asar-unpack is deprecated, please set as asar.unpack")
    }
    if (buildMetadata["asar-unpack-dir"] != null) {
      warn("asar-unpack-dir is deprecated, please set as asar.unpackDir")
    }

    if (result == null || result === true) {
      result = {
        unpack: buildMetadata["asar-unpack"],
        unpackDir: buildMetadata["asar-unpack-dir"]
      }
    }

    return Object.assign(result, {
      extraMetadata: this.options.extraMetadata
    })
  }

  private doCopyExtraFiles(patterns: Array<FileMatcher> | n): Promise<any> {
    if (patterns == null || patterns.length === 0) {
      return BluebirdPromise.resolve()
    }
    else {
      const promises: Array<Promise<any>> = []
      for (let i = 0; i < patterns.length; i++) {
        if (patterns[i].isEmpty()) {
          patterns[i].addPattern("**/*")
        }
        promises.push(copyFiltered(patterns[i].from, patterns[i].to, patterns[i].createFilter(), this.platform === Platform.WINDOWS))
      }
      return BluebirdPromise.all(promises)
    }
  }

  private getFileMatchers(name: "files" | "extraFiles" | "extraResources", defaultSrc: string, defaultDest: string, allowAdvancedMatching: boolean, fileMatchOptions: FileMatchOptions, customBuildOptions: DC): Array<FileMatcher> | n {
    let globalPatterns: Array<string | FilePattern> | string | n = (<any>this.devMetadata.build)[name]
    let platformSpecificPatterns: Array<string | FilePattern> | string | n = (<any>customBuildOptions)[name]

    const defaultMatcher = new FileMatcher(defaultSrc, defaultDest, fileMatchOptions)
    const fileMatchers: Array<FileMatcher> = []

    function addPatterns(patterns: Array<string | FilePattern> | string | n) {
      if (patterns == null) {
        return
      }
      else if (!Array.isArray(patterns)) {
        defaultMatcher.addPattern(patterns)
        return
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

    return fileMatchers.length ? fileMatchers : null
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

  protected async archiveApp(format: string, appOutDir: string, outFile: string): Promise<any> {
    const isMac = this.platform === Platform.MAC
    return archiveApp(this.devMetadata.build.compression, format, outFile, isMac ? path.join(appOutDir, `${this.appInfo.productFilename}.app`) : appOutDir, isMac)
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
    return `${deployment ? this.appInfo.name : this.appInfo.productFilename}-${this.appInfo.version}${classifier == null ? "" : `-${classifier}`}${dotExt}`
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
    return asArray(this.devMetadata.build.fileAssociations).concat(asArray(this.platformSpecificBuildOptions.fileAssociations))
  }

  async getResource(custom: string | n, ...names: Array<string>): Promise<string | null> {
    if (custom === undefined) {
      const resourceList = await this.resourceList
      for (let name of names) {
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

  readonly file: string
  readonly artifactName?: string

  readonly platform: Platform
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
    publishers = packager.info.devMetadata.build.publish
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

export async function getResolvedPublishConfig(packager: BuildInfo, publishConfig: PublishConfiguration | GithubOptions | BintrayOptions, errorIfCannot: boolean): Promise<PublishConfiguration | null> {
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

  if (publishConfig.provider === "github") {
    return Object.assign({}, publishConfig, {owner: owner, repo: project})
  }
  else if (publishConfig.provider === "bintray") {
    return Object.assign({}, publishConfig, {owner: owner, package: project, repo: "generic"})
  }
  else {
    return null
  }
}