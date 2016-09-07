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
  readonly version: string
  readonly buildNumber: string
  readonly buildVersion: string

  readonly productName: string
  readonly productFilename: string

  constructor(public metadata: AppMetadata, private devMetadata: DevMetadata, buildVersion?: string | null) {
    this.version = metadata.version!

    this.buildNumber = (<any>this.devMetadata.build)["build-version"] || process.env.TRAVIS_BUILD_NUMBER || process.env.APPVEYOR_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM || process.env.BUILD_NUMBER

    if (isEmptyOrSpaces(buildVersion)) {
      buildVersion = this.version
      if (!isEmptyOrSpaces(this.buildNumber)) {
        buildVersion += `.${this.buildNumber}`
      }
      this.buildVersion = buildVersion
    }
    else {
      this.buildVersion = buildVersion!
    }

    this.productName = getProductName(this.metadata, this.devMetadata)
    this.productFilename = sanitizeFileName(this.productName)
  }

  get companyName() {
    return this.metadata.author!.name
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

  get copyright(): string {
    const metadata = this.devMetadata.build
    const old = (<any>metadata)["app-copyright"]
    if (old != null) {
      warn('"app-copyright" is deprecated — please use "copyright" instead')
    }

    const copyright = metadata.copyright || old
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