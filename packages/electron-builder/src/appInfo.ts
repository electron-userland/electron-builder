import { isEmptyOrSpaces, smarten, warn } from "electron-builder-util"
import sanitizeFileName from "sanitize-filename"
import { prerelease, SemVer } from "semver"
import { BuildInfo } from "./packagerApi"

export class AppInfo {
  readonly description = smarten(this.info.metadata.description || "")
  readonly version: string
  readonly buildNumber: string
  readonly buildVersion: string

  readonly productName: string
  readonly productFilename: string

  constructor (private readonly info: BuildInfo, buildVersion?: string | null) {
    this.version = info.metadata.version!

    this.buildNumber = info.config.buildVersion || process.env.TRAVIS_BUILD_NUMBER || process.env.APPVEYOR_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM || process.env.BUILD_NUMBER

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

    this.productName = info.config.productName || info.metadata.productName || info.metadata.name!
    this.productFilename = sanitizeFileName(this.productName)
  }

  get channel(): string | null {
    const prereleaseInfo = prerelease(this.version)
    if (prereleaseInfo != null && prereleaseInfo.length > 0) {
      return prereleaseInfo[0]
    }
    return null
  }

  get versionInWeirdWindowsForm(): string {
    const parsedVersion = new SemVer(this.version)
    return `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}.${this.buildNumber || "0"}`
  }

  get companyName(): string | null {
    const author = this.info.metadata.author
    return author == null ? null : author.name
  }

  get id(): string {
    let appId
    if (this.info.config.appId != null) {
      appId = this.info.config.appId
    }

    const generateDefaultAppId = () => {
      return `com.electron.${this.info.metadata.name!.toLowerCase()}`
    }

    if (appId != null && (appId === "your.id" || isEmptyOrSpaces(appId))) {
      const incorrectAppId = appId
      appId = generateDefaultAppId()
      warn(`Do not use "${incorrectAppId}" as appId, "${appId}" will be used instead`)
    }

    return appId == null ? generateDefaultAppId() : appId
  }

  get name(): string {
    return this.info.metadata.name!
  }

  get copyright(): string {
    const copyright = this.info.config.copyright
    if (copyright != null) {
      return copyright
    }
    return `Copyright © ${new Date().getFullYear()} ${this.companyName || this.productName}`
  }

  async computePackageUrl(): Promise<string | null> {
    const url = this.info.metadata.homepage
    if (url != null) {
      return url
    }

    const info = await this.info.repositoryInfo
    return info == null || info.type !== "github"  ? null : `https://${info.domain}/${info.user}/${info.project}`
  }
}