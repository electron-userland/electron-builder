import { InfoRetriever, ProjectMetadataProvider } from "./repositoryInfo"
import { AppMetadata, DevMetadata, Platform, PlatformSpecificBuildOptions, getProductName, Arch } from "./metadata"
import EventEmitter = NodeJS.EventEmitter
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import { pack, ElectronPackagerOptions, userIgnoreFilter } from "electron-packager-tf"
import { readdir, copy, unlink, lstat, remove } from "fs-extra-p"
import { statOrNull, use, spawn, debug7zArgs, debug, warn, log, spawnNpmProduction } from "./util"
import { Packager } from "./packager"
import { listPackage, statFile, AsarFileMetadata, createPackageFromFiles, AsarOptions } from "asar"
import { path7za } from "7zip-bin"
import { Glob } from "glob"
import { Minimatch } from "minimatch"
import deepAssign = require("deep-assign")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

class CompressionDescriptor {
  constructor(public flag: string, public env: string, public minLevel: string, public maxLevel: string = "-9") {
  }
}

const extToCompressionDescriptor: { [key: string]: CompressionDescriptor; } = {
  "tar.xz": new CompressionDescriptor("--xz", "XZ_OPT", "-0", "-9e"),
  "tar.lz": new CompressionDescriptor("--lzip", "LZOP", "-0"),
  "tar.gz": new CompressionDescriptor("--gz", "GZIP", "-1"),
  "tar.bz2": new CompressionDescriptor("--bzip2", "BZIP2", "-1"),
}

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
}

export interface BuildInfo extends ProjectMetadataProvider {
  options: PackagerOptions

  devMetadata: DevMetadata

  projectDir: string
  appDir: string

  electronVersion: string

  repositoryInfo: InfoRetriever | n
  eventEmitter: EventEmitter

  isTwoPackageJsonProjectLayoutUsed: boolean
}

export abstract class PlatformPackager<DC extends PlatformSpecificBuildOptions> implements ProjectMetadataProvider {
  protected readonly options: PackagerOptions

  protected readonly projectDir: string
  readonly buildResourcesDir: string

  readonly metadata: AppMetadata
  readonly devMetadata: DevMetadata

  readonly customBuildOptions: DC

  readonly appName: string

  readonly resourceList: Promise<Array<string>>

  public abstract get platform(): Platform

  constructor(public info: BuildInfo) {
    this.options = info.options
    this.projectDir = info.projectDir
    this.metadata = info.metadata
    this.devMetadata = info.devMetadata

    this.buildResourcesDir = path.resolve(this.projectDir, this.relativeBuildResourcesDirname)
    this.customBuildOptions = (<any>info.devMetadata.build)[this.platform.buildConfigurationKey] || Object.create(null)
    this.appName = getProductName(this.metadata, this.devMetadata)

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

      let promise: Promise<any> | null = null
      const deprecatedIgnore = (<any>this.devMetadata.build).ignore
      if (deprecatedIgnore) {
        if (typeof deprecatedIgnore === "function") {
          log(`"ignore is specified as function, may be new "files" option will be suit your needs? Please see https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-files`)
        }
        else {
          warn(`"ignore is deprecated, please use "files", see https://github.com/electron-userland/electron-builder/wiki/Options#BuildMetadata-files`)
        }

        promise = copy(this.info.appDir, appPath, {filter: userIgnoreFilter(opts), dereference: true})
      }
      else {
        let patterns = this.getFilePatterns("files", customBuildOptions)
        if (patterns == null || patterns.length === 0) {
          patterns = ["**/*"]
        }

        const parsedPatterns = this.getParsedPatterns(patterns, arch)
        if (!this.info.isTwoPackageJsonProjectLayoutUsed) {
          const dotOptions = {dot: true}
          parsedPatterns.push(new Minimatch("!node_modules/@(appdmg|electron-download|electron-builder|electron-prebuilt|electron-packager-tf|electron-winstaller-fixed|electron-osx-sign-tf|electron-osx-sign){,/**/*}", dotOptions))
          parsedPatterns.push(new Minimatch(`!@(${path.relative(this.info.appDir, this.buildResourcesDir)}|${path.relative(this.info.appDir, opts.out!)}){,/**/*}`, dotOptions))
        }
        promise = copyFiltered(this.info.appDir, appPath, parsedPatterns, true)
      }

      const promises = [promise]
      if (this.info.electronVersion[0] === "0") {
        // electron release >= 0.37.4 - the default_app/ folder is a default_app.asar file
        promises.push(remove(path.join(resourcesPath, "default_app.asar")), remove(path.join(resourcesPath, "default_app")))
      }
      else {
        promises.push(unlink(path.join(resourcesPath, "default_app.asar")))
      }

      await BluebirdPromise.all(promises)

      let npmPrune = this.devMetadata.build.npmPrune
      if (npmPrune == null) {
        npmPrune = this.devMetadata.build.prune
        if (npmPrune != null) {
          warn("prune is deprecated and renamed to npmPrune, please specify as npmPrune")
        }
      }

      if (npmPrune == null) {
        npmPrune = !this.info.isTwoPackageJsonProjectLayoutUsed
      }
      else if (typeof npmPrune !== "boolean") {
        throw new Error(`npmPrune expected to be boolean value, but string '"${npmPrune}"' was specified`)
      }

      if (npmPrune) {
        log("Pruning app dependencies")
        await spawnNpmProduction("prune", appPath)
      }

      if (asarOptions != null) {
        await this.createAsarArchive(appPath, resourcesPath, asarOptions)
      }
    }
    await pack(options)

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
    const version = this.metadata.version
    let buildVersion = version
    const buildNumber = this.computeBuildNumber()
    if (buildNumber != null) {
      buildVersion += "." + buildNumber
    }

    //noinspection JSUnusedGlobalSymbols
    const options: any = deepAssign({
      dir: this.info.appDir,
      out: outDir,
      name: this.appName,
      productName: this.appName,
      platform: this.platform.nodeName,
      arch: Arch[arch],
      version: this.info.electronVersion,
      icon: path.join(this.buildResourcesDir, "icon"),
      overwrite: true,
      "app-version": version,
      "app-copyright": `Copyright © ${new Date().getFullYear()} ${this.metadata.author.name || this.appName}`,
      "build-version": buildVersion,
      tmpdir: false,
      generateFinalBasename: () => path.basename(appOutDir),
      "version-string": {
        CompanyName: this.metadata.author.name,
        FileDescription: smarten(this.metadata.description),
        ProductName: this.appName,
        InternalName: this.appName,
      }
    }, this.devMetadata.build)

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

  private async createAsarArchive(src: string, resourcesPath: string, options: AsarOptions): Promise<any> {
    // dot: true as in the asar by default by we use glob default - do not copy hidden files
    let glob: Glob | null = null
    const files = (await new BluebirdPromise<Array<string>>((resolve, reject) => {
      glob = new Glob("**/*", {
        cwd: src,
      }, (error, matches) => {
        if (error == null) {
          resolve(matches)
        }
        else {
          reject(error)
        }
      })
    })).map(it => path.join(src, it))

    const metadata: { [key: string]: AsarFileMetadata; } = {}

    const stats = await BluebirdPromise.map(files, it => {
      if (glob!.symlinks[it]) {
        // asar doesn't use stat for link
        metadata[it] = {
          type: "link",
        }
      }
      else if (glob!.cache[it] === "FILE") {
        const stat = glob!.statCache[it]
        return stat == null ? lstat(it) : <any>stat
      }
      else {
        // asar doesn't use stat for dir
        metadata[it] = {
          type: "directory",
        }
      }
      return null
    })

    for (let i = 0, n = files.length; i < n; i++) {
      const stat = stats[i]
      if (stat != null) {
        metadata[files[i]] = {
          type: "file",
          stat: stat,
        }
      }
    }

    await BluebirdPromise.promisify(createPackageFromFiles)(src, path.join(resourcesPath, "app.asar"), files, metadata, options)
    await remove(src)
  }

  private expandPattern(pattern: string, arch: Arch): string {
    return pattern
      .replace(/\$\{arch}/g, Arch[arch])
      .replace(/\$\{os}/g, this.platform.buildConfigurationKey)
      .replace(/\$\{\/\*}/g, "{,/**/*,/**/.*}")
  }

  private async doCopyExtraFiles(isResources: boolean, appOutDir: string, arch: Arch, customBuildOptions: DC): Promise<any> {
    const base = isResources ? this.getResourcesDir(appOutDir) : this.platform === Platform.OSX ? path.join(appOutDir, `${this.appName}.app`, "Contents") : appOutDir
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

  async computePackageUrl(): Promise<string | null> {
    const url = this.metadata.homepage || this.devMetadata.homepage
    if (url != null) {
      return url
    }

    if (this.info.repositoryInfo != null) {
      const info = await this.info.repositoryInfo.getInfo(this)
      if (info != null) {
        return `https://github.com/${info.user}/${info.project}`
      }
    }
    return null
  }

  protected computeBuildNumber(): string | null {
    return this.devMetadata.build["build-version"] || process.env.TRAVIS_BUILD_NUMBER || process.env.APPVEYOR_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM || process.env.BUILD_NUMBER
  }

  private getResourcesDir(appOutDir: string): string {
    return this.platform === Platform.OSX ? this.getOSXResourcesDir(appOutDir) : path.join(appOutDir, "resources")
  }

  private getOSXResourcesDir(appOutDir: string): string {
    return path.join(appOutDir, `${this.appName}.app`, "Contents", "Resources")
  }

  private async statFileInPackage(resourcesDir: string, packageFile: string, isAsar: boolean): Promise<any> {
    const relativeFile = path.relative(this.info.appDir, path.resolve(this.info.appDir, packageFile))
    if (isAsar) {
      try {
        return statFile(path.join(resourcesDir, "app.asar"), relativeFile) != null
      }
      catch (e) {
        const asarFile = path.join(resourcesDir, "app.asar")
        const fileStat = await statOrNull(asarFile)
        if (fileStat == null) {
          throw new Error(`File "${asarFile}" does not exist. Seems like a wrong configuration.`)
        }

        try {
          listPackage(asarFile)
        }
        catch (e) {
          throw new Error(`File "${asarFile}" is corrupted: ${e}`)
        }

        // asar throws error on access to undefined object (info.link)
        return false
      }
    }
    else {
      const outStat = await statOrNull(path.join(resourcesDir, "app", relativeFile))
      return outStat != null && outStat.isFile()
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
    const mainFile = this.metadata.main || "index.js"
    const mainFileExists = await this.statFileInPackage(resourcesDir, mainFile, isAsar)
    if (!mainFileExists) {
      throw new Error(`Application entry file ${mainFile} could not be found in package. Seems like a wrong configuration.`)
    }
  }

  protected async archiveApp(format: string, appOutDir: string, outFile: string): Promise<any> {
    const compression = this.devMetadata.build.compression
    const storeOnly = compression === "store"

    const dirToArchive = this.platform === Platform.OSX ? path.join(appOutDir, `${this.appName}.app`) : appOutDir
    if (format.startsWith("tar.")) {
      // we don't use 7z here - develar: I spent a lot of time making pipe working - but it works on OS X and often hangs on Linux (even if use pipe-io lib)
      // and in any case it is better to use system tools (in the light of docker - it is not problem for user because we provide complete docker image).
      const info = extToCompressionDescriptor[format]
      let tarEnv = process.env
      if (compression != null && compression !== "normal") {
        tarEnv = Object.assign({}, process.env)
        tarEnv[info.env] = storeOnly ? info.minLevel : info.maxLevel
      }

      await spawn(process.platform === "darwin" || process.platform === "freebsd" ? "gtar" : "tar", [info.flag, "--transform", `s,^\.,${path.basename(outFile, "." + format)},`, "-cf", outFile, "."], {
        cwd: dirToArchive,
        stdio: ["ignore", debug.enabled ? "inherit" : "ignore", "inherit"],
        env: tarEnv
      })
      return
    }

    const args = debug7zArgs("a")
    if (compression === "maximum") {
      if (format === "7z" || format.endsWith(".7z")) {
        args.push("-mx=9", "-mfb=64", "-md=32m", "-ms=on")
      }
      else if (format === "zip") {
        // http://superuser.com/a/742034
        //noinspection SpellCheckingInspection
        args.push("-mfb=258", "-mpass=15")
      }
      else {
        args.push("-mx=9")
      }
    }
    else if (storeOnly) {
      if (format !== "zip") {
        args.push("-mx=1")
      }
    }

    // remove file before - 7z doesn't overwrite file, but update
    try {
      await unlink(outFile)
    }
    catch (e) {
      // ignore
    }

    if (format === "zip" || storeOnly) {
      args.push("-mm=" + (storeOnly ? "Copy" : "Deflate"))
    }

    args.push(outFile, dirToArchive)

    await spawn(path7za, args, {
      cwd: path.dirname(dirToArchive),
      stdio: ["ignore", debug.enabled ? "inherit" : "ignore", "inherit"],
    })
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

function copyFiltered(src: string, destination: string, patterns: Array<Minimatch>, dereference: boolean = false): Promise<any> {
  return copy(src, destination, {
    dereference: dereference,
    filter: it => {
      if (src === it) {
        return true
      }

      let relative = it.substring(src.length + 1)
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