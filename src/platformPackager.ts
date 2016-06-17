import { AppMetadata, DevMetadata, Platform, PlatformSpecificBuildOptions, Arch } from "./metadata"
import EventEmitter = NodeJS.EventEmitter
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import { pack, ElectronPackagerOptions, userIgnoreFilter } from "electron-packager-tf"
import { readdir, copy, unlink, remove, realpath } from "fs-extra-p"
import { statOrNull, use, exec } from "./util"
import { Packager } from "./packager"
import { AsarOptions } from "asar"
import { archiveApp } from "./targets/archive"
import { Minimatch } from "minimatch"
import { checkFileInPackage, createAsarArchive } from "./asarUtil"
import deepAssign = require("deep-assign")
import { warn, log, task } from "./log"
import { AppInfo } from "./appInfo"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export const commonTargets = ["dir", "zip", "7z", "tar.xz", "tar.lz", "tar.gz", "tar.bz2"]

export const DIR_TARGET = "dir"

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

export abstract class PlatformPackager<DC extends PlatformSpecificBuildOptions> {
  protected readonly options: PackagerOptions

  protected readonly projectDir: string
  readonly buildResourcesDir: string

  readonly metadata: AppMetadata
  readonly devMetadata: DevMetadata

  readonly customBuildOptions: DC

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
    this.customBuildOptions = (<any>info.devMetadata.build)[this.platform.buildConfigurationKey] || Object.create(null)

    this.resourceList = readdir(this.buildResourcesDir)
      .catch(e => {
        if (e.code !== "ENOENT") {
          throw e
        }
        return []
      })
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

  protected hasOnlyDirTarget(): boolean {
    for (let targets of this.options.targets!.get(this.platform)!.values()) {
      for (let t of targets) {
        if (t !== "dir") {
          return false
        }
      }
    }

    const targets = normalizeTargets(this.customBuildOptions.target)
    return targets != null && targets.length === 1 && targets[0] === "dir"
  }

  get relativeBuildResourcesDirname() {
    return use(this.devMetadata.directories, it => it!.buildResources) || "build"
  }

  abstract get supportedTargets(): Array<string>

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

  abstract pack(outDir: string, arch: Arch, targets: Array<string>, postAsyncTasks: Array<Promise<any>>): Promise<any>

  protected async doPack(options: ElectronPackagerOptions, outDir: string, appOutDir: string, arch: Arch, customBuildOptions: DC) {
    const asarOptions = this.computeAsarOptions(customBuildOptions)
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

      let patterns = this.getFilePatterns("files", customBuildOptions)
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

      const promise = copyFiltered(this.info.appDir, appPath, this.getParsedPatterns(patterns, arch), true, ignoreFiles, rawFilter)

      const promises = [promise]
      if (this.info.electronVersion[0] === "0") {
        // electron release >= 0.37.4 - the default_app/ folder is a default_app.asar file
        promises.push(remove(path.join(resourcesPath, "default_app.asar")), remove(path.join(resourcesPath, "default_app")))
      }
      else {
        promises.push(unlink(path.join(resourcesPath, "default_app.asar")))
      }

      await BluebirdPromise.all(promises)

      if (opts.prune != null) {
        warn("prune is deprecated — development dependencies are never copied in any case")
      }

      if (asarOptions != null) {
        await createAsarArchive(appPath, resourcesPath, asarOptions)
      }
    }
    await task(`Packaging for platform ${options.platform} ${options.arch} using electron ${options.version} to ${path.relative(this.projectDir, appOutDir)}`, pack(options))

    await this.doCopyExtraFiles(true, appOutDir, arch, customBuildOptions)
    await this.doCopyExtraFiles(false, appOutDir, arch, customBuildOptions)

    const afterPack = this.devMetadata.build.afterPack
    if (afterPack != null) {
      await afterPack({
        appOutDir: appOutDir,
        options: options,
      })
    }

    await this.sanityCheckPackage(appOutDir, asarOptions != null)
  }

  protected computePackOptions(outDir: string, appOutDir: string, arch: Arch): ElectronPackagerOptions {
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
      icon: path.join(this.buildResourcesDir, "icon"),
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
    const base = isResources ? this.getResourcesDir(appOutDir) : this.platform === Platform.OSX ? path.join(appOutDir, `${this.appInfo.productName}.app`, "Contents") : appOutDir
    const patterns = this.getFilePatterns(isResources ? "extraResources" : "extraFiles", customBuildOptions)
    return patterns == null || patterns.length === 0 ? null : copyFiltered(this.projectDir, base, this.getParsedPatterns(patterns, arch))
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
    return this.platform === Platform.OSX ? this.getOSXResourcesDir(appOutDir) : path.join(appOutDir, "resources")
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
    return archiveApp(this.devMetadata.build.compression, format, outFile, this.platform === Platform.OSX ? path.join(appOutDir, `${this.appInfo.productName}.app`) : appOutDir)
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
}

export function getArchSuffix(arch: Arch): string {
  return arch === Arch.x64 ? "" : `-${Arch[arch]}`
}

export interface ArtifactCreated {
  readonly file: string
  readonly artifactName?: string

  readonly platform: Platform
}

export function normalizeTargets(targets: Array<string> | string | null | undefined): Array<string> | null {
  if (targets == null) {
    return null
  }
  else {
    return (Array.isArray(targets) ? targets : [targets]).map(it => it.toLowerCase().trim())
  }
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

// https://github.com/joshwnj/minimatch-all/blob/master/index.js
function minimatchAll(path: string, patterns: Array<Minimatch>): boolean {
  let match = false
  for (let pattern of patterns) {
    // If we've got a match, only re-test for exclusions.
    // if we don't have a match, only re-test for inclusions.
    if (match !== pattern.negate) {
      continue
    }

    // partial match — pattern: foo/bar.txt path: foo — we must allow foo
    // use it only for non-negate patterns: const m = new Minimatch("!node_modules/@(electron-download|electron-prebuilt)/**/*", {dot: true }); m.match("node_modules", true) will return false, but must be true
    match = pattern.match(path, !pattern.negate)
    if (!match && !pattern.negate) {
      const rawPattern = pattern.pattern
      // 1 - slash
      const patternLengthPlusSlash = rawPattern.length + 1
      if (path.length > patternLengthPlusSlash) {
        // foo: include all directory content
        match = path[rawPattern.length] === "/" && path.startsWith(rawPattern)
      }
    }
  }
  return match
}

// we use relative path to avoid canonical path issue - e.g. /tmp vs /private/tmp
function copyFiltered(src: string, destination: string, patterns: Array<Minimatch>, dereference: boolean = false, ignoreFiles?: Set<string>, rawFilter?: (file: string) => boolean): Promise<any> {
  return copy(src, destination, {
    dereference: dereference,
    filter: it => {
      if (src === it) {
        return true
      }

      if (rawFilter != null && !rawFilter(it)) {
        return false
      }

      let relative = it.substring(src.length + 1)

      // yes, check before path sep normalization
      if (ignoreFiles != null && ignoreFiles.has(relative)) {
        return false
      }

      if (path.sep === "\\") {
        relative = relative.replace(/\\/g, "/")
      }
      return minimatchAll(relative, patterns)
    }
  })
}

export function computeEffectiveTargets(rawList: Array<string>, targetsFromMetadata: Array<string> | n): Array<string> {
  let targets = normalizeTargets(rawList.length === 0 ? targetsFromMetadata : rawList)
  return targets == null ? ["default"] : targets
}

async function listDependencies(appDir: string, production: boolean): Promise<Array<string>> {
  let npmExecPath = process.env.npm_execpath || process.env.NPM_CLI_JS
  const npmExecArgs = ["ls", production ? "--production" : "--dev", "--parseable"]
  if (npmExecPath == null) {
    npmExecPath = process.platform === "win32" ? "npm.cmd" : "npm"
  }
  else {
    npmExecArgs.unshift(npmExecPath)
    npmExecPath = process.env.npm_node_execpath || process.env.NODE_EXE || "node"
  }

  const result = (await exec(npmExecPath, npmExecArgs, {
    cwd: appDir,
    stdio: "inherit",
    maxBuffer: 1024 * 1024,
  })).trim().split("\n")
  if (result.length > 0 && !result[0].includes("/node_modules/")) {
    // first line is a project dir
    const lastIndex = result.length - 1
    result[0] = result[lastIndex]
    result.length = result.length - 1
  }
  return result
}