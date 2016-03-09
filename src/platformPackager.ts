import { InfoRetriever, ProjectMetadataProvider } from "./repositoryInfo"
import { AppMetadata, DevMetadata, Platform, getProductName } from "./metadata"
import EventEmitter = NodeJS.EventEmitter
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import packager = require("electron-packager-tf")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

const pack = BluebirdPromise.promisify(packager)

export interface PackagerOptions {
  arch?: string

  dist?: boolean
  githubToken?: string

  sign?: string

  platform?: Array<string>
  target?: Array<string>

  appDir?: string

  projectDir?: string

  cscLink?: string
  csaLink?: string
  cscKeyPassword?: string
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

export abstract class PlatformPackager<DC> implements ProjectMetadataProvider {
  protected readonly options: PackagerOptions

  protected readonly projectDir: string
  protected readonly buildResourcesDir: string

  readonly metadata: AppMetadata
  readonly devMetadata: DevMetadata

  customDistOptions: DC

  readonly appName: string

  protected abstract get platform(): Platform

  constructor(protected info: BuildInfo) {
    this.options = info.options
    this.projectDir = info.projectDir
    this.metadata = info.metadata
    this.devMetadata = info.devMetadata

    this.buildResourcesDir = path.resolve(this.projectDir, this.relativeBuildResourcesDirname)

    if (this.options.dist) {
      const buildMetadata: any = info.devMetadata.build
      this.customDistOptions = buildMetadata == null ? buildMetadata : buildMetadata[this.platform.buildConfigurationKey]
    }

    this.appName = getProductName(this.metadata)
  }

  protected get relativeBuildResourcesDirname() {
    const directories = this.devMetadata.directories
    return (directories == null ? null : directories.buildResources) || "build"
  }

  protected dispatchArtifactCreated(file: string) {
    this.info.eventEmitter.emit("artifactCreated", file, this.platform)
  }

  pack(platform: string, outDir: string, appOutDir: string, arch: string): Promise<any> {
    const version = this.metadata.version
    let buildVersion = version
    const buildNumber = process.env.TRAVIS_BUILD_NUMBER || process.env.APPVEYOR_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM
    if (buildNumber != null) {
      buildVersion += "." + buildNumber
    }

    const options = Object.assign({
      dir: this.info.appDir,
      out: outDir,
      name: this.appName,
      platform: platform,
      arch: arch,
      version: this.info.electronVersion,
      icon: path.join(this.buildResourcesDir, "icon"),
      asar: true,
      overwrite: true,
      "app-version": version,
      "build-version": buildVersion,
      "version-string": {
        CompanyName: this.metadata.author.name,
        FileDescription: this.metadata.description,
        ProductVersion: version,
        FileVersion: buildVersion,
        ProductName: this.appName,
        InternalName: this.appName,
      }
    }, this.metadata.build, {"tmpdir": false})

    // this option only for windows-installer
    delete options.iconUrl
    return pack(options)
  }

  abstract packageInDistributableFormat(outDir: string, appOutDir: string, arch: string): Promise<any>
}