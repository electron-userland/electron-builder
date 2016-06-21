import { AppMetadata, DevMetadata, Platform, PlatformSpecificBuildOptions, Arch } from "./metadata"
import EventEmitter = NodeJS.EventEmitter
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import { pack, ElectronPackagerOptions, userIgnoreFilter } from "electron-packager-tf"
import { readdir, unlink, remove, realpath } from "fs-extra-p"
import { statOrNull, use } from "./util"
import { Packager } from "./packager"
import { AsarOptions } from "asar"
import { archiveApp } from "./targets/archive"
import { Minimatch } from "minimatch"
import { checkFileInPackage, createAsarArchive } from "./asarUtil"
import deepAssign = require("deep-assign")
import { warn, log, task } from "./log"
import { AppInfo } from "./appInfo"
import { listDependencies, createFilter, copyFiltered } from "./util/filter"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

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
}

export abstract class PlatformPackager<DC extends PlatformSpecificBuildOptions> {
  protected readonly options: PackagerOptions

  readonly projectDir: string
  readonly buildResourcesDir: string

  readonly metadata: AppMetadata
  readonly devMetadata: DevMetadata

  readonly platformSpecificBuildOptions: DC

  readonly resourceList: Promise<Array<string>>

  abstract get platform(): Platform

  readonly appInfo: AppInfo

  constructor(public info: BuildInfo) {
    this.appInfo = info.appInfo
    this.options = info.options
    this.projectDir = info.projectDir
    this.metadata = info.appInfo.metadata
    this.devMetadata = info.devMetadata

    this.buildResourcesDir = path.resolve(this.projectDir, this.relativeBuildResourcesDirname)

    this.platformSpecificBuildOptions = this.normalizePlatformSpecificBuildOptions((<any>info.devMetadata.build)[this.platform.buildConfigurationKey])

    this.resourceList = readdir(this.buildResourcesDir)
      .catch(e => {
        if (e.code !== "ENOENT") {
          throw e
        }
        return []
      })
  }

  normalizePlatformSpecificBuildOptions(options: DC | n): DC {
    return options == null ? Object.create(null) : options
  }

  createTargets(targets: Array<string>, mapper: (name: string, factory: () => Target) => void, cleanupTasks: Array<() => Promise<any>>): void {
    throw new Error("not implemented")
  }

  protected getCscPassword(): string {
    const password = this.options.cscKeyPassword
    if (password == null) {
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

  protected async doPack(options: ElectronPackagerOptions, outDir: string, appOutDir: string, arch: Arch, platformSpecificBuildOptions: DC) {
    const asarOptions = this.computeAsarOptions(platformSpecificBuildOptions)
    options.initializeApp = async (opts, buildDir, appRelativePath) => {
      const appPath = path.join(buildDir, appRelativePath)
      const resourcesPath = path.dirname(appPath)

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

      let patterns = this.getFilePatterns("files", platformSpecificBuildOptions)
      if (patterns == null || patterns.length === 0) {
        patterns = ["**/*"]
      }

      let rawFilter: any = null
      const deprecatedIgnore = (<any>this.devMetadata.build).ignore
      if (deprecatedIgnore) {
        if (typeof deprecatedIgnore === "function") {
          log(`"ignore is specified as function, may be new "files" option will be suit your needs? Please see https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-files`)
        }
        else {
          warn(`"ignore is deprecated, please use "files", see https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-files`)
        }
        rawFilter = userIgnoreFilter(opts)
      }

      const filter = createFilter(this.info.appDir, this.getParsedPatterns(patterns, arch), ignoreFiles, rawFilter)
      const promise = asarOptions == null ?
        copyFiltered(this.info.appDir, appPath, filter, true)
        : createAsarArchive(this.info.appDir, resourcesPath, asarOptions, filter)

      const promises = [promise]
      if (this.info.electronVersion[0] === "0") {
        // electron release >= 0.37.4 - the default_app/ folder is a default_app.asar file
        promises.push(remove(path.join(resourcesPath, "default_app.asar")), remove(path.join(resourcesPath, "default_app")))
      }
      else {
        promises.push(unlink(path.join(resourcesPath, "default_app.asar")))
      }

      await BluebirdPromise.all(promises)
    }
    await task(`Packaging for platform ${options.platform} ${options.arch} using electron ${options.version} to ${path.relative(this.projectDir, appOutDir)}`, pack(options))

    await this.doCopyExtraFiles(true, appOutDir, arch, platformSpecificBuildOptions)
    await this.doCopyExtraFiles(false, appOutDir, arch, platformSpecificBuildOptions)

    const afterPack = this.devMetadata.build.afterPack
    if (afterPack != null) {
      await afterPack({
        appOutDir: appOutDir,
        options: options,
      })
    }

    await this.sanityCheckPackage(appOutDir, asarOptions != null)
  }

  protected async computePackOptions(outDir: string, appOutDir: string, arch: Arch): Promise<ElectronPackagerOptions> {
    //noinspection JSUnusedGlobalSymbols
    const options: any = deepAssign({
      dir: this.info.appDir,
      "app-bundle-id": this.appInfo.id,
      out: outDir,
      name: this.appInfo.productName,
      productName: this.appInfo.productName,
      platform: this.platform.nodeName,
      arch: Arch[arch],
      version: this.info.electronVersion,
      icon: await this.getIconPath(),
      overwrite: true,
      "app-version": this.appInfo.version,
      "app-copyright": this.appInfo.copyright,
      "build-version": this.appInfo.buildVersion,
      tmpdir: false,
      generateFinalBasename: () => path.basename(appOutDir),
    }, this.devMetadata.build)

    if (this.platform === Platform.WINDOWS) {
      options["version-string"] = this.appInfo.versionString
    }

    delete options.osx
    delete options.win
    delete options.linux
    // this option only for windows-installer
    delete options.iconUrl
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

    const buildMetadata = <ElectronPackagerOptions>this.devMetadata.build
    if (buildMetadata["asar-unpack"] != null) {
      warn("asar-unpack is deprecated, please set as asar.unpack")
    }
    if (buildMetadata["asar-unpack-dir"] != null) {
      warn("asar-unpack-dir is deprecated, please set as asar.unpackDir")
    }

    if (result == null || result === true) {
      return {
        unpack: buildMetadata["asar-unpack"],
        unpackDir: buildMetadata["asar-unpack-dir"]
      }
    }
    else {
      return result
    }
  }

  private expandPattern(pattern: string, arch: Arch): string {
    return pattern
      .replace(/\$\{arch}/g, Arch[arch])
      .replace(/\$\{os}/g, this.platform.buildConfigurationKey)
      .replace(/\$\{\/\*}/g, "{,/**/*,/**/.*}")
  }

  private async doCopyExtraFiles(isResources: boolean, appOutDir: string, arch: Arch, customBuildOptions: DC): Promise<any> {
    const base = isResources ? this.getResourcesDir(appOutDir) : this.platform === Platform.MAC ? path.join(appOutDir, `${this.appInfo.productName}.app`, "Contents") : appOutDir
    const patterns = this.getFilePatterns(isResources ? "extraResources" : "extraFiles", customBuildOptions)
    return patterns == null || patterns.length === 0 ? null : copyFiltered(this.projectDir, base, createFilter(this.projectDir, this.getParsedPatterns(patterns, arch)))
  }

  private getParsedPatterns(patterns: Array<string>, arch: Arch): Array<Minimatch> {
    const minimatchOptions = {}
    const parsedPatterns: Array<Minimatch> = []
    for (let i = 0; i < patterns.length; i++) {
      parsedPatterns[i] = new Minimatch(this.expandPattern(patterns[i], arch), minimatchOptions)
    }
    return parsedPatterns
  }

  private getFilePatterns(name: "files" | "extraFiles" | "extraResources", customBuildOptions: DC): Array<string> | n {
    let patterns: Array<string> | string | n = (<any>this.devMetadata.build)[name]
    if (patterns != null && !Array.isArray(patterns)) {
      patterns = [patterns]
    }

    let platformSpecificPatterns: Array<string> | string | n = (<any>customBuildOptions)[name]
    if (platformSpecificPatterns != null) {
      if (!Array.isArray(platformSpecificPatterns)) {
        platformSpecificPatterns = [platformSpecificPatterns]
      }
      return patterns == null ? platformSpecificPatterns : Array.from(new Set(patterns.concat(platformSpecificPatterns)))
    }
    return patterns
  }

  private getResourcesDir(appOutDir: string): string {
    return this.platform === Platform.MAC ? this.getOSXResourcesDir(appOutDir) : path.join(appOutDir, "resources")
  }

  private getOSXResourcesDir(appOutDir: string): string {
    return path.join(appOutDir, `${this.appInfo.productName}.app`, "Contents", "Resources")
  }

  private async checkFileInPackage(resourcesDir: string, file: string, isAsar: boolean) {
    const relativeFile = path.relative(this.info.appDir, path.resolve(this.info.appDir, file))
    if (isAsar) {
      await checkFileInPackage(path.join(resourcesDir, "app.asar"), relativeFile)
    }
    else {
      const outStat = await statOrNull(path.join(resourcesDir, "app", relativeFile))
      if (outStat == null) {
        throw new Error(`Application entry file "${relativeFile}" does not exist. Seems like a wrong configuration.`)
      }
      else if (!outStat.isFile()) {
        throw new Error(`Application entry file "${relativeFile}" is not a file. Seems like a wrong configuration.`)
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

    const mainFile = this.metadata.main || "index.js"
    await this.checkFileInPackage(this.getResourcesDir(appOutDir), mainFile, isAsar)
  }

  protected async archiveApp(format: string, appOutDir: string, outFile: string): Promise<any> {
    return archiveApp(this.devMetadata.build.compression, format, outFile, this.platform === Platform.MAC ? path.join(appOutDir, `${this.appInfo.productName}.app`) : appOutDir)
  }

  generateName(ext: string, arch: Arch, deployment: boolean): string {
    return this.generateName2(ext, arch === Arch.x64 ? null : Arch[arch], deployment)
  }

  generateName1(ext: string, arch: Arch, classifier: string, deployment: boolean): string {
    let c = arch === Arch.x64 ? null : Arch[arch]
    if (c == null) {
      c = classifier
    }
    else {
      c += `-${classifier}`
    }
    return this.generateName2(ext, c, deployment)
  }

  generateName2(ext: string, classifier: string | n, deployment: boolean): string {
    return `${deployment ? this.appInfo.name : this.appInfo.productName}-${this.metadata.version}${classifier == null ? "" : `-${classifier}`}.${ext}`
  }

  protected async getDefaultIcon(ext: string) {
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