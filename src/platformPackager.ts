import { InfoRetriever, ProjectMetadataProvider } from "./repositoryInfo"
import { AppMetadata, DevMetadata, Platform, PlatformSpecificBuildOptions, getProductName } from "./metadata"
import EventEmitter = NodeJS.EventEmitter
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import { pack, ElectronPackagerOptions } from "electron-packager-tf"
import globby = require("globby")
import { readdir, copy, unlink } from "fs-extra-p"
import { statOrNull, use, spawn, debug7zArgs, debug } from "./util"
import { Packager } from "./packager"
import deepAssign = require("deep-assign")
import { listPackage, statFile } from "asar"
import { path7za } from "7zip-bin"

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

// class Target {
//   constructor(public platform: Platform, arch?: "ia32" | "x64")
// }
//
export const DIR_TARGET = "dir"

export interface PackagerOptions {
  target?: Array<string> | null

  platform?: Array<Platform> | null
  arch?: string | null

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
}

export abstract class PlatformPackager<DC extends PlatformSpecificBuildOptions> implements ProjectMetadataProvider {
  protected readonly options: PackagerOptions

  protected readonly projectDir: string
  protected readonly buildResourcesDir: string

  readonly metadata: AppMetadata
  readonly devMetadata: DevMetadata

  readonly customBuildOptions: DC

  readonly appName: string

  readonly targets: Array<string>

  readonly resourceList: Promise<Array<string>>

  public abstract get platform(): Platform

  constructor(protected info: BuildInfo) {
    this.options = info.options
    this.projectDir = info.projectDir
    this.metadata = info.metadata
    this.devMetadata = info.devMetadata

    this.buildResourcesDir = path.resolve(this.projectDir, this.relativeBuildResourcesDirname)
    this.customBuildOptions = (<any>info.devMetadata.build)[this.platform.buildConfigurationKey] || Object.create(null)
    this.appName = getProductName(this.metadata, this.devMetadata)

    let targets = normalizeTargets(this.customBuildOptions.target)
    const cliTargets = normalizeTargets(this.options.target)
    if (cliTargets != null) {
      targets = cliTargets
    }

    if (targets != null) {
      const supportedTargets = this.supportedTargets.concat(commonTargets)
      for (let target of targets) {
        if (target !== "default" && !supportedTargets.includes(target)) {
          throw new Error(`Unknown target: ${target}`)
        }
      }
    }
    this.targets = targets == null ? ["default"] : targets

    this.resourceList = readdir(this.buildResourcesDir)
      .catch(e => {
        if (e.code !== "ENOENT") {
          throw e
        }
        return []
      })
  }

  protected hasOnlyDirTarget(): boolean {
    return this.targets.length === 1 && this.targets[0] === "dir"
  }

  protected get relativeBuildResourcesDirname() {
    return use(this.devMetadata.directories, it => it!.buildResources) || "build"
  }

  protected abstract get supportedTargets(): Array<string>

  protected computeAppOutDir(outDir: string, arch: string): string {
    return path.join(outDir, `${this.platform.buildConfigurationKey}${arch === "x64" ? "" : `-${arch}`}`)
  }

  protected dispatchArtifactCreated(file: string, artifactName?: string) {
    this.info.eventEmitter.emit("artifactCreated", {
      file: file,
      artifactName: artifactName,
      platform: this.platform,
    })
  }

  abstract pack(outDir: string, arch: string, postAsyncTasks: Array<Promise<any>>): Promise<any>

  protected async doPack(options: ElectronPackagerOptions, outDir: string, appOutDir: string, arch: string, customBuildOptions: DC) {
    await this.packApp(options, appOutDir)
    await this.copyExtraResources(appOutDir, arch, customBuildOptions)
  }

  protected computePackOptions(outDir: string, appOutDir: string, arch: string): ElectronPackagerOptions {
    const version = this.metadata.version
    let buildVersion = version
    const buildNumber = this.computeBuildNumber()
    if (buildNumber != null) {
      buildVersion += "." + buildNumber
    }

    const options = deepAssign({
      dir: this.info.appDir,
      out: outDir,
      name: this.appName,
      productName: this.appName,
      platform: this.platform.nodeName,
      arch: arch,
      version: this.info.electronVersion,
      icon: path.join(this.buildResourcesDir, "icon"),
      asar: true,
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

  protected async packApp(options: ElectronPackagerOptions, appOutDir: string): Promise<any> {
    await pack(options)

    const afterPack = this.devMetadata.build.afterPack
    if (afterPack != null) {
      await afterPack({
        appOutDir: appOutDir,
        options: options,
      })
    }

    await this.sanityCheckPackage(appOutDir, <boolean>options.asar)
  }

  private getExtraResources(arch: string, customBuildOptions: DC): Promise<Array<string>> {
    const buildMetadata: any = this.devMetadata.build
    let extraResources: Array<string> | n = buildMetadata == null ? null : buildMetadata.extraResources

    const platformSpecificExtraResources = customBuildOptions.extraResources
    if (platformSpecificExtraResources != null) {
      extraResources = extraResources == null ? platformSpecificExtraResources : extraResources.concat(platformSpecificExtraResources)
    }

    if (extraResources == null) {
      return BluebirdPromise.resolve([])
    }

    const expandedPatterns = extraResources.map(it => it
      .replace(/\$\{arch}/g, arch)
      .replace(/\$\{os}/g, this.platform.buildConfigurationKey))
    return globby(expandedPatterns, {cwd: this.projectDir})
  }

  protected async copyExtraResources(appOutDir: string, arch: string, customBuildOptions: DC): Promise<Array<string>> {
    let resourcesDir = appOutDir
    if (this.platform === Platform.OSX) {
      resourcesDir = this.getOSXResourcesDir(appOutDir)
    }
    return await BluebirdPromise.map(await this.getExtraResources(arch, customBuildOptions), it => copy(path.join(this.projectDir, it), path.join(resourcesDir, it)))
  }

  protected async computePackageUrl(): Promise<string | null> {
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
    return path.join(appOutDir, this.appName + ".app", "Contents", "Resources")
  }

  private async statFileInPackage(resourcesDir: string, packageFile: string, isAsar: boolean): Promise<any> {
    const relativeFile = path.relative(this.info.appDir, path.resolve(this.info.appDir, packageFile))
    if (isAsar) {
      try {
        return statFile(path.join(resourcesDir, "app.asar"), relativeFile) != null
      }
      catch (e) {
        // asar throws error on access to undefined object (info.link)
        return false
      }
    }
    else {
      const outStat = await statOrNull(path.join(resourcesDir, "app", relativeFile))
      return outStat != null && outStat.isFile()
    }
  }

  private static async sanityCheckAsar(asarFile: string): Promise<any> {
    const outStat = await statOrNull(asarFile)

    if (outStat == null) {
      throw new Error(`Package file ${asarFile} was not created.`)
    }

    try {
      listPackage(asarFile)
    }
    catch (e) {
      throw new Error(`Package file ${asarFile} is corrupted.`)
    }
  }

  private async sanityCheckPackage(appOutDir: string, isAsar: boolean): Promise<any> {
    const outStat = await statOrNull(appOutDir)

    if (outStat == null) {
      throw new Error(`Output directory ${appOutDir} does not exists. Seems like a wrong configuration.`)
    }
    else if (!outStat.isDirectory()) {
      throw new Error(`Output directory ${appOutDir} is not a directory. Seems like a wrong configuration.`)
    }

    const resourcesDir = this.getResourcesDir(appOutDir)
    if (isAsar) {
      await PlatformPackager.sanityCheckAsar(path.join(resourcesDir, "app.asar"))
    }

    const mainFile = this.metadata.main || "index.js"
    const mainFileExists = await this.statFileInPackage(resourcesDir, mainFile, isAsar)
    if (!mainFileExists) {
      throw new Error(`Application entry file ${mainFile} could not be found in package. Seems like a wrong configuration.`)
    }
  }

  protected async archiveApp(format: string, appOutDir: string, outFile: string): Promise<any> {
    const compression = this.devMetadata.build.compression
    const storeOnly = compression === "store"

    const fileToArchive = this.platform === Platform.OSX ? path.join(appOutDir, `${this.appName}.app`) : appOutDir
    const baseDir = path.dirname(fileToArchive)
    if (format.startsWith("tar.")) {
      // we don't use 7z here - develar: I spent a lot of time making pipe working - but it works on OS X and often hangs on Linux (even if use pipe-io lib)
      // and in any case it is better to use system tools (in the light of docker - it is not problem for user because we provide complete docker image).
      const info = extToCompressionDescriptor[format]
      let tarEnv = process.env
      if (compression != null && compression !== "normal") {
        tarEnv = Object.assign({}, process.env)
        tarEnv[info.env] = storeOnly ? info.minLevel : info.maxLevel
      }

      await spawn(process.platform === "darwin" ? "/usr/local/opt/gnu-tar/libexec/gnubin/tar" : "tar", [info.flag, "-cf", outFile, fileToArchive], {
        cwd: baseDir,
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

    args.push(outFile, fileToArchive)

    await spawn(path7za, args, {
      cwd: baseDir,
      stdio: ["ignore", debug.enabled ? "inherit" : "ignore", "inherit"],
    })
  }
}

export function archSuffix(arch: string) {
  return arch === "x64" ? "" : `-${arch}`
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
