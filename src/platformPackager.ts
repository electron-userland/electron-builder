import { AppMetadata, DevMetadata, Platform, PlatformSpecificBuildOptions, Arch } from "./metadata"
import EventEmitter = NodeJS.EventEmitter
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import { readdir, remove, realpath } from "fs-extra-p"
import { statOrNull, use, unlinkIfExists, isEmptyOrSpaces } from "./util/util"
import { Packager } from "./packager"
import { AsarOptions } from "asar-electron-builder"
import { archiveApp } from "./targets/archive"
import { Minimatch } from "minimatch"
import { checkFileInArchive, createAsarArchive } from "./asarUtil"
import { warn, log, task } from "./util/log"
import { AppInfo } from "./appInfo"
import { listDependencies, createFilter, copyFiltered, hasMagic } from "./util/filter"
import { ElectronPackagerOptions, pack } from "./packager/dirPackager"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./util/awaiter")

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
  options: PackagerOptions

  devMetadata: DevMetadata

  projectDir: string
  appDir: string

  electronVersion: string

  eventEmitter: EventEmitter

  isTwoPackageJsonProjectLayoutUsed: boolean

  // computed final effective appId
  appInfo: AppInfo
}

export class Target {
  constructor(public name: string) {
  }

  finishBuild(): Promise<any> {
    return BluebirdPromise.resolve()
  }
}

export abstract class TargetEx extends Target {
  abstract async build(appOutDir: string, arch: Arch): Promise<any>
}

export interface FilePattern {
  from?: string
  to?: string
  filter?: Array<string> | string
}

export interface FileMatchOptions {
  arch: string,
  os: string
}

export class FileMatcher {
  readonly from: string
  readonly to: string
  readonly options: FileMatchOptions

  private parsedPatterns: Array<Minimatch>

  constructor(from: string, to: string, options: FileMatchOptions, patterns?: Array<string> | string | n) {
    this.options = options
    this.parsedPatterns = []

    this.from = this.expandPattern(from)
    this.to = this.expandPattern(to)

    if (patterns != null && !Array.isArray(patterns)) {
      this.addPattern(patterns)
    }
    else if (patterns != null) {
      for (let i = 0; i < patterns.length; i++) {
        this.addPattern(patterns[i])
      }
    }
  }

  addPattern(pattern: string) {
    const minimatchOptions = {}

    const expandedPattern = this.expandPattern(pattern)
    const parsedPattern = new Minimatch(expandedPattern, minimatchOptions)
    this.parsedPatterns.push(parsedPattern)

    if (!hasMagic(parsedPattern)) {
      // https://github.com/electron-userland/electron-builder/issues/545
      // add **/*
      this.parsedPatterns.push(new Minimatch(`${expandedPattern}/*/**`, minimatchOptions))
    }
  }

  isEmpty() {
    return this.parsedPatterns.length === 0
  }

  merge(fileMatch: FileMatcher): FileMatcher {
    if (fileMatch.from !== this.from || fileMatch.to !== this.to) {
      throw new Error("Cannot merge FileMatchers with different source/destinations")
    }

    const mergedFileMatch = new FileMatcher(this.from, this.to, this.options)
    mergedFileMatch.parsedPatterns = this.parsedPatterns.concat(fileMatch.parsedPatterns)
    return mergedFileMatch
  }

  createFilter(ignoreFiles?: Set<string>, rawFilter?: (file: string) => boolean, exclude?: FileMatcher | n): (file: string) => boolean {
    const excludePatterns = exclude != null ? exclude.parsedPatterns : null
    return createFilter(this.from, this.parsedPatterns, ignoreFiles, rawFilter, excludePatterns)
  }

  private expandPattern(pattern: string): string {
    return pattern
      .replace(/\$\{arch}/g, this.options.arch)
      .replace(/\$\{os}/g, this.options.os)
      .replace(/\$\{\/\*}/g, "{,/**/*,/**/.*}")
  }
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

  createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void, cleanupTasks: Array<() => Promise<any>>): void {
    throw new Error("not implemented")
  }

  protected getCscPassword(): string {
    const password = this.options.cscKeyPassword || process.env.CSC_KEY_PASSWORD
    if (isEmptyOrSpaces(password)) {
      log("CSC_KEY_PASSWORD is not defined, empty password will be used")
      return ""
    }
    else {
      return password.trim()
    }
  }

  get relativeBuildResourcesDirname() {
    return use(this.devMetadata.directories, it => it!.buildResources) || "build"
  }

  protected computeAppOutDir(outDir: string, arch: Arch): string {
    return path.join(outDir, `${this.platform.buildConfigurationKey}${arch === Arch.x64 ? "" : `-${Arch[arch]}`}`)
  }

  dispatchArtifactCreated(file: string, artifactName?: string) {
    this.info.eventEmitter.emit("artifactCreated", {
      file: file,
      artifactName: artifactName,
      platform: this.platform,
    })
  }

  abstract pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any>

  private getExtraFilePatterns(isResources: boolean, appOutDir: string, fileMatchOptions: FileMatchOptions, customBuildOptions: DC): Array<FileMatcher> | n {
    const base = isResources ? this.getResourcesDir(appOutDir) : (this.platform === Platform.MAC ? path.join(appOutDir, `${this.appInfo.productFilename}.app`, "Contents") : appOutDir)
    return this.getFilePatterns(isResources ? "extraResources" : "extraFiles", this.projectDir, base, true, fileMatchOptions, customBuildOptions)
  }

  protected async doPack(options: ElectronPackagerOptions, outDir: string, appOutDir: string, platformName: string, arch: Arch, platformSpecificBuildOptions: DC) {
    const asarOptions = this.computeAsarOptions(platformSpecificBuildOptions)
    const fileMatchOptions: FileMatchOptions = {
      arch: Arch[arch],
      os: this.platform.buildConfigurationKey
    }

    const extraResourcePatterns = this.getExtraFilePatterns(true, appOutDir, fileMatchOptions, platformSpecificBuildOptions)
    const extraFilePatterns = this.getExtraFilePatterns(false, appOutDir, fileMatchOptions, platformSpecificBuildOptions)

    const resourcesPath = this.platform === Platform.MAC ? path.join(appOutDir, "Electron.app", "Contents", "Resources") : path.join(appOutDir, "resources")

    const p = pack(options, appOutDir, platformName, Arch[arch], this.info.electronVersion, async() => {
      const ignoreFiles = new Set([path.relative(this.info.appDir, outDir), path.relative(this.info.appDir, this.buildResourcesDir)])
      if (!this.info.isTwoPackageJsonProjectLayoutUsed) {
        const result = await BluebirdPromise.all([listDependencies(this.info.appDir, false), listDependencies(this.info.appDir, true)])
        const productionDepsSet = new Set(result[1])

        // npm returns real path, so, we should use relative path to avoid any mismatch
        const realAppDirPath = await realpath(this.info.appDir)

        for (let it of result[0]) {
          if (!productionDepsSet.has(it)) {
            if (it.startsWith(realAppDirPath)) {
              it = it.substring(realAppDirPath.length + 1)
            }
            else if (it.startsWith(this.info.appDir)) {
              it = it.substring(this.info.appDir.length + 1)
            }
            ignoreFiles.add(it)
          }
        }
      }

      let patterns = this.getFilePatterns("files", this.info.appDir, path.join(resourcesPath, "app"), false, fileMatchOptions, platformSpecificBuildOptions)
      let defaultMatcher = patterns != null ? patterns[0] : new FileMatcher(this.info.appDir, path.join(resourcesPath, "app"), fileMatchOptions)

      if (defaultMatcher.isEmpty()) {
        defaultMatcher.addPattern("**/*")
      }
      defaultMatcher.addPattern("!**/node_modules/*/{README.md,README,readme.md,readme,test}")

      let rawFilter: any = null
      const deprecatedIgnore = (<any>this.devMetadata.build).ignore
      if (deprecatedIgnore) {
        if (typeof deprecatedIgnore === "function") {
          log(`"ignore is specified as function, may be new "files" option will be suit your needs? Please see https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-files`)
        }
        else {
          warn(`"ignore is deprecated, please use "files", see https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-files`)
        }
        rawFilter = deprecatedUserIgnoreFilter(options, this.info.appDir)
      }

      let excludePatterns: FileMatcher | null = null
      if (!this.info.isTwoPackageJsonProjectLayoutUsed) {
        if (extraResourcePatterns != null) {
          excludePatterns = extraResourcePatterns[0]
        }
        if (extraFilePatterns != null) {
          if (excludePatterns == null) {
            excludePatterns = extraFilePatterns[0]
          }
          else {
            excludePatterns = excludePatterns.merge(extraFilePatterns[0])
          }
        }
      }

      const filter = defaultMatcher.createFilter(ignoreFiles, rawFilter, excludePatterns)
      const promise = asarOptions == null ?
        copyFiltered(this.info.appDir, path.join(resourcesPath, "app"), filter, this.platform === Platform.WINDOWS)
        : createAsarArchive(this.info.appDir, resourcesPath, asarOptions, filter)

      const promises = [promise, unlinkIfExists(path.join(resourcesPath, "default_app.asar")), unlinkIfExists(path.join(appOutDir, "version"))]
      if (this.info.electronVersion[0] === "0") {
        // electron release >= 0.37.4 - the default_app/ folder is a default_app.asar file
        promises.push(remove(path.join(resourcesPath, "default_app")))
      }

      promises.push(this.postInitApp(appOutDir))
      await BluebirdPromise.all(promises)
    })
    await task(`Packaging for platform ${platformName} ${Arch[arch]} using electron ${this.info.electronVersion} to ${path.relative(this.projectDir, appOutDir)}`, p)

    await this.doCopyExtraFiles(true, extraResourcePatterns)
    await this.doCopyExtraFiles(false, extraFilePatterns)

    const afterPack = this.devMetadata.build.afterPack
    if (afterPack != null) {
      await afterPack({
        appOutDir: appOutDir,
        options: options,
      })
    }

    await this.sanityCheckPackage(appOutDir, asarOptions != null)
  }

  protected postInitApp(executableFile: string): Promise<any> {
    return BluebirdPromise.resolve(null)
  }

  protected async computePackOptions(): Promise<ElectronPackagerOptions> {
    //noinspection JSUnusedGlobalSymbols
    const appInfo = this.appInfo
    const options: any = Object.assign({
      appInfo: appInfo,
      platformPackager: this,
    }, this.devMetadata.build)

    delete options.osx
    delete options.win
    delete options.linux
    return options
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

  private doCopyExtraFiles(isResources: boolean, patterns: Array<FileMatcher> | n): Promise<any> {
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

  private getFilePatterns(name: "files" | "extraFiles" | "extraResources", defaultSrc: string, defaultDest: string, allowAdvancedMatching: boolean, fileMatchOptions: FileMatchOptions, customBuildOptions: DC): Array<FileMatcher> | n {
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
    return archiveApp(this.devMetadata.build.compression, format, outFile, this.platform === Platform.MAC ? path.join(appOutDir, `${this.appInfo.productFilename}.app`) : appOutDir)
  }

  generateName(ext: string | null, arch: Arch, deployment: boolean, classifier: string | null = null): string {
    let c = arch === Arch.x64 ? (ext === "AppImage" ? "x86_64" : null) : Arch[arch]
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
}

export function getArchSuffix(arch: Arch): string {
  return arch === Arch.x64 ? "" : `-${Arch[arch]}`
}

export interface ArtifactCreated {
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

export function deprecatedUserIgnoreFilter(opts: ElectronPackagerOptions, appDir: string) {
  let ignore = opts.ignore || []
  let ignoreFunc: any

  if (typeof (ignore) === "function") {
    ignoreFunc = function (file: string) { return !ignore(file) }
  }
  else {
    if (!Array.isArray(ignore)) {
      ignore = [ignore]
    }

    ignoreFunc = function (file: string) {
      for (let i = 0; i < ignore.length; i++) {
        if (file.match(ignore[i])) {
          return false
        }
      }

      return true
    }
  }

  return function filter(file: string) {
    let name = file.split(path.resolve(appDir))[1]
    if (path.sep === "\\") {
      // convert slashes so unix-format ignores work
      name = name.replace(/\\/g, "/")
    }
    return ignoreFunc(name)
  }
}