import { DevMetadata, AppMetadata } from "./metadata"
import { warn } from "./util/log"
import { smarten } from "./platformPackager"
import { isEmptyOrSpaces } from "./util/util"
import { getRepositoryInfo } from "./repositoryInfo"
import sanitizeFileName from "sanitize-filename"
import { SemVer } from "semver"

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

  get versionInWeirdWindowsForm(): string {
    const parsedVersion = new SemVer(this.version)
    return `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}.${this.buildNumber || "0"}`
  }

  get companyName() {
    return this.metadata.author!.name
  }

  get id(): string {
    let appId = this.devMetadata.build["app-bundle-id"]
    if (appId != null) {
      warn("app-bundle-id is deprecated, please use appId")
    }

    if (this.devMetadata.build.appId != null) {
      appId = this.devMetadata.build.appId
    }

    const generateDefaultAppId = () => {
      return `com.electron.${this.metadata.name.toLowerCase()}`
    }

    if (appId === "your.id" || isEmptyOrSpaces(appId)) {
      const incorrectAppId = appId
      appId = generateDefaultAppId()
      warn(`Do not use "${incorrectAppId}" as appId, "${appId}" will be used instead`)
    }

    return appId == null ? generateDefaultAppId() : appId
  }

  get name(): string {
    return this.metadata.name
  }

  get copyright(): string {
    const copyright = this.devMetadata.build.copyright
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