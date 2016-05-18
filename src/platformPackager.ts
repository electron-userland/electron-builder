import { InfoRetriever, ProjectMetadataProvider } from "./repositoryInfo"
import { AppMetadata, DevMetadata, Platform, PlatformSpecificBuildOptions, getProductName } from "./metadata"
import EventEmitter = NodeJS.EventEmitter
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import packager = require("electron-packager-tf")
import globby = require("globby")
import { copy } from "fs-extra-p"
import { statOrNull, use } from "./util"
import { Packager } from "./packager"
import deepAssign = require("deep-assign")
import { listPackage, statFile } from "asar"
import ElectronPackagerOptions = ElectronPackager.ElectronPackagerOptions

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

const pack = BluebirdPromise.promisify(packager)

export interface PackagerOptions {
  arch?: string | null

  dist?: boolean | null
  githubToken?: string | null

  sign?: string | null

  platform?: Array<Platform> | null

  // deprecated
  appDir?: string | null

  projectDir?: string | null

  cscLink?: string | null
  csaLink?: string | null
  cscKeyPassword?: string | null

  cscInstallerLink?: string | null
  cscInstallerKeyPassword?: string | null

  platformPackagerFactory?: ((packager: Packager, platform: Platform, cleanupTasks: Array<() => Promise<any>>) => PlatformPackager<any>) | n

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

  public abstract get platform(): Platform

  constructor(protected info: BuildInfo) {
    this.options = info.options
    this.projectDir = info.projectDir
    this.metadata = info.metadata
    this.devMetadata = info.devMetadata

    this.buildResourcesDir = path.resolve(this.projectDir, this.relativeBuildResourcesDirname)
    this.customBuildOptions = (<any>info.devMetadata.build)[this.platform.buildConfigurationKey] || Object.create(null)
    this.appName = getProductName(this.metadata, this.devMetadata)
  }

  protected get relativeBuildResourcesDirname() {
    return use(this.devMetadata.directories, it => it!.buildResources) || "build"
  }

  protected computeAppOutDir(outDir: string, arch: string): string {
    return path.join(outDir, `${this.appName}-${this.platform.nodeName}-${arch}`)
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

  protected computePackOptions(outDir: string, arch: string): ElectronPackagerOptions {
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
      "version-string": {
        CompanyName: this.metadata.author.name,
        FileDescription: this.metadata.description,
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
