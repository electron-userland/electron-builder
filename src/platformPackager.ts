import { AppMetadata, InfoRetriever, ProjectMetadataProvider, Metadata } from "./repositoryInfo"
import EventEmitter = NodeJS.EventEmitter
import { tsAwaiter } from "./awaiter"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import packager = require("electron-packager-tf")

const __awaiter = tsAwaiter
Array.isArray(__awaiter)

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
  platform?: string
  appDir?: string

  projectDir?: string

  cscLink?: string
  cscKeyPassword?: string
}

export interface BuildInfo extends ProjectMetadataProvider {
  options: PackagerOptions

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

  abstract getBuildConfigurationKey(): string

  constructor(protected info: BuildInfo) {
    this.options = info.options
    this.projectDir = info.projectDir
    this.metadata = info.metadata
    this.devMetadata = info.devMetadata
  }

  protected dispatchArtifactCreated(path: string) {
    this.info.eventEmitter.emit("artifactCreated", path)
  }

  pack(platform: string, arch: string, outDir: string): Promise<any> {
    return new BluebirdPromise((resolve, reject) => {
      const version = this.metadata.version
      let buildVersion = version
      const buildNumber = process.env.TRAVIS_BUILD_NUMBER || process.env.APPVEYOR_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM
      if (buildNumber != null) {
        buildVersion += "." + buildNumber
      }

      const options = Object.assign({
        dir: this.info.appDir,
        out: path.dirname(outDir),
        name: this.metadata.name,
        platform: platform,
        arch: arch,
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
      packager(options, error => error == null ? resolve(null) : reject(error))
    })
  }

  abstract packageInDistributableFormat(outDir: string, customConfiguration: DC, arch: string): Promise<any>
}