import { InfoRetriever, ProjectMetadataProvider } from "./repositoryInfo"
import { AppMetadata, DevMetadata, Platform, PlatformSpecificBuildOptions, getProductName } from "./metadata"
import EventEmitter = NodeJS.EventEmitter
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import packager = require("electron-packager-tf")
import globby = require("globby")
import { copy } from "fs-extra-p"
import { statOrNull } from "./util"
import { Packager } from "./packager"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

const pack = BluebirdPromise.promisify(packager)

export interface PackagerOptions {
  arch?: string

  dist?: boolean
  githubToken?: string

  sign?: string

  platform?: Array<Platform>
  target?: Array<string>

  appDir?: string

  projectDir?: string

  cscLink?: string
  csaLink?: string
  cscKeyPassword?: string

  platformPackagerFactory?: (packager: Packager, platform: Platform, cleanupTasks: Array<() => Promise<any>>) => PlatformPackager<any>
}

export interface BuildInfo extends ProjectMetadataProvider {
  options: PackagerOptions

  devMetadata: DevMetadata

  projectDir: string
  appDir: string

  electronVersion: string

  repositoryInfo: InfoRetriever
  eventEmitter: EventEmitter
}

export abstract class PlatformPackager<DC extends PlatformSpecificBuildOptions> implements ProjectMetadataProvider {
  protected readonly options: PackagerOptions

  protected readonly projectDir: string
  protected readonly buildResourcesDir: string

  readonly metadata: AppMetadata
  readonly devMetadata: DevMetadata

  customBuildOptions: DC

  readonly appName: string

  public abstract get platform(): Platform

  constructor(protected info: BuildInfo) {
    this.options = info.options
    this.projectDir = info.projectDir
    this.metadata = info.metadata
    this.devMetadata = info.devMetadata

    this.buildResourcesDir = path.resolve(this.projectDir, this.relativeBuildResourcesDirname)

    this.customBuildOptions = (<any>info.devMetadata.build)[this.platform.buildConfigurationKey]

    this.appName = getProductName(this.metadata, this.devMetadata)
  }

  protected get relativeBuildResourcesDirname() {
    return use(this.devMetadata.directories, it => it.buildResources) || "build"
  }

  protected dispatchArtifactCreated(file: string, artifactName?: string) {
    this.info.eventEmitter.emit("artifactCreated", {
      file: file,
      artifactName: artifactName,
      platform: this.platform,
    })
  }

  async pack(outDir: string, appOutDir: string, arch: string): Promise<any> {
    await this.doPack(outDir, appOutDir, arch)
    await this.copyExtraResources(appOutDir, arch)
  }

  protected async doPack(outDir: string, appOutDir: string, arch: string) {
    const version = this.metadata.version
    let buildVersion = version
    const buildNumber = this.computeBuildNumber()
    if (buildNumber != null) {
      buildVersion += "." + buildNumber
    }

    checkConflictingOptions(this.devMetadata.build)

    const options = Object.assign({
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

    await pack(options)

    const outStat = await statOrNull(appOutDir)
    if (outStat == null) {
      throw new Error(`Output directory ${appOutDir} does not exists. Seems like a wrong configuration.`)
    }
    else if (!outStat.isDirectory()) {
      throw new Error(`Output directory ${appOutDir} is a file. Seems like a wrong configuration.`)
    }
  }

  protected getExtraResources(arch: string): Promise<Array<string>> {
    const buildMetadata: any = this.devMetadata.build
    let extraResources: Array<string> = buildMetadata == null ? null : buildMetadata.extraResources

    const platformSpecificExtraResources = this.customBuildOptions == null ? null : this.customBuildOptions.extraResources
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

  protected async copyExtraResources(appOutDir: string, arch: string): Promise<Array<string>> {
    let resourcesDir = appOutDir
    if (this.platform === Platform.OSX) {
      resourcesDir = path.join(resourcesDir, this.appName + ".app", "Contents", "Resources")
    }
    return await BluebirdPromise.map(await this.getExtraResources(arch), it => copy(path.join(this.projectDir, it), path.join(resourcesDir, it)))
  }

  abstract packageInDistributableFormat(outDir: string, appOutDir: string, arch: string): Promise<any>

  protected async computePackageUrl(): Promise<string> {
    const url = this.devMetadata.homepage
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

  //noinspection JSMethodCanBeStatic
  protected computeBuildNumber(): string {
    return process.env.TRAVIS_BUILD_NUMBER || process.env.APPVEYOR_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM
  }
}

function checkConflictingOptions(options: any) {
  for (let name of ["all", "out", "tmpdir", "version", "platform", "dir", "arch"]) {
    if (name in options) {
      throw new Error(`Option ${name} is ignored, do not specify it.`)
    }
  }
}

export interface ArtifactCreated {
  readonly file: string
  readonly artifactName?: string

  readonly platform: Platform
}

export function use<T, R>(value: T, task: (it: T) => R): R {
  return value == null ? null : task(value)
}