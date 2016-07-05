import { ElectronPackagerOptions } from "electron-packager-tf"
import { DevMetadata, AppMetadata } from "./metadata"
import { warn } from "./util/log"
import { smarten } from "./platformPackager"
import { isEmptyOrSpaces } from "./util/util"
import { getRepositoryInfo } from "./repositoryInfo"
import sanitizeFileName = require("sanitize-filename")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./util/awaiter")

export class AppInfo {
  readonly description = smarten(this.metadata.description!)

  // windows-only
  versionString = {
    CompanyName: this.companyName,
    FileDescription: this.description,
    ProductName: this.productName,
    InternalName: this.productName,
    LegalCopyright: this.copyright,
  }

  readonly version: string
  readonly buildVersion: string

  readonly productFilename: string

  constructor(public metadata: AppMetadata, private devMetadata: DevMetadata) {
    let buildVersion = metadata.version!
    this.version = buildVersion

    const buildNumber = this.buildNumber
    if (!isEmptyOrSpaces(buildNumber)) {
      buildVersion += `.${buildNumber}`
    }
    this.buildVersion = buildVersion

    this.productFilename = sanitizeFileName(this.productName)
  }

  get companyName() {
    return this.metadata.author!.name
  }

  get buildNumber(): string | null {
   return this.devMetadata.build["build-version"] || process.env.TRAVIS_BUILD_NUMBER || process.env.APPVEYOR_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM || process.env.BUILD_NUMBER
  }

  get id(): string {
    const appId = this.devMetadata.build["app-bundle-id"]
    if (appId != null) {
      warn("app-bundle-id is deprecated, please use appId")
    }

    if (this.devMetadata.build.appId != null) {
      return this.devMetadata.build.appId
    }

    if (appId == null) {
      return `com.electron.${this.metadata.name.toLowerCase()}`
    }
    return appId
  }

  get name(): string {
    return this.metadata.name
  }

  get productName(): string {
    return getProductName(this.metadata, this.devMetadata)
  }

  get copyright(): string {
    const copyright = (<ElectronPackagerOptions>this.devMetadata.build)["app-copyright"]
    if (copyright != null) {
      return copyright
    }
    return `Copyright © ${new Date().getFullYear()} ${this.metadata.author!.name || this.productName}`
  }

  async computePackageUrl(): Promise<string | null> {
    const url = this.metadata.homepage || this.devMetadata.homepage
    if (url != null) {
      return url
    }

    const info = await getRepositoryInfo(this.metadata, this.devMetadata)
    if (info != null) {
      return `https://github.com/${info.user}/${info.project}`
    }
    return null
  }
}

function getProductName(metadata: AppMetadata, devMetadata: DevMetadata) {
  return devMetadata.build.productName || metadata.productName || metadata.name
}