import { AppMetadata, InfoRetriever, ProjectMetadataProvider, Metadata } from "./repositoryInfo"
import EventEmitter = NodeJS.EventEmitter
import { tsAwaiter } from "./awaiter"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import packager = require("electron-packager-tf")

const __awaiter = tsAwaiter
Array.isArray(__awaiter)

const pack = BluebirdPromise.promisify(packager)

export interface DevMetadata extends Metadata {
  build: DevBuildMetadata
}

export interface DevBuildMetadata {
  osx: appdmg.Specification
  win: any,
  linux: any
}

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
  protected options: PackagerOptions

  protected projectDir: string

  metadata: AppMetadata
  devMetadata: Metadata

  customDistOptions: DC

  currentArch: string

  protected abstract getBuildConfigurationKey(): string

  constructor(protected info: BuildInfo) {
    this.options = info.options
    this.projectDir = info.projectDir
    this.metadata = info.metadata
    this.devMetadata = info.devMetadata

    if (this.options.dist) {
      const buildMetadata: any = info.devMetadata.build
      this.customDistOptions = buildMetadata == null ? buildMetadata : buildMetadata[this.getBuildConfigurationKey()]
    }
  }

  protected dispatchArtifactCreated(path: string) {
    this.info.eventEmitter.emit("artifactCreated", path)
  }

  pack(platform: string, outDir: string, appOutDir: string): Promise<any> {
    const version = this.metadata.version
    let buildVersion = version
    const buildNumber = process.env.TRAVIS_BUILD_NUMBER || process.env.APPVEYOR_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM
    if (buildNumber != null) {
      buildVersion += "." + buildNumber
    }

    const options = Object.assign({
      dir: this.info.appDir,
      out: outDir,
      name: this.metadata.name,
      platform: platform,
      arch: this.currentArch,
      version: this.info.electronVersion,
      icon: path.join(this.projectDir, "build", "icon"),
      asar: true,
      overwrite: true,
      "app-version": version,
      "build-version": buildVersion,
      "version-string": {
        CompanyName: this.metadata.author,
        FileDescription: this.metadata.description,
        ProductVersion: version,
        FileVersion: buildVersion,
        ProductName: this.metadata.name,
        InternalName: this.metadata.name,
      }
    }, this.metadata.build, {"tmpdir": false})

    // this option only for windows-installer
    delete options.iconUrl
    return pack(options)
  }

  abstract packageInDistributableFormat(outDir: string, appOutDir: string): Promise<any>
}