import { isEmptyOrSpaces, smarten } from "electron-builder-util"
import { warn } from "electron-builder-util/out/log"
import sanitizeFileName from "sanitize-filename"
import { SemVer } from "semver"
import { Config, Metadata } from "./metadata"
import { BuildInfo } from "./packagerApi"

export class AppInfo {
  readonly description = smarten(this.metadata.description || "")
  readonly version: string
  readonly buildNumber: string
  readonly buildVersion: string

  readonly productName: string
  readonly productFilename: string

  private get config(): Config {
    return this.info.config
  }

  constructor(public metadata: Metadata, private info: BuildInfo, buildVersion?: string | null) {
    this.version = metadata.version!

    this.buildNumber = this.config.buildVersion || process.env.TRAVIS_BUILD_NUMBER || process.env.APPVEYOR_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM || process.env.BUILD_NUMBER

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

    this.productName = this.config.productName || metadata.productName || metadata.name!
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
    let appId = (<any>this.config)["app-bundle-id"]
    if (appId != null) {
      warn("app-bundle-id is deprecated, please use appId")
    }

    if (this.config.appId != null) {
      appId = this.config.appId
    }

    const generateDefaultAppId = () => {
      return `com.electron.${this.metadata.name!.toLowerCase()}`
    }

    if (appId === "your.id" || isEmptyOrSpaces(appId)) {
      const incorrectAppId = appId
      appId = generateDefaultAppId()
      warn(`Do not use "${incorrectAppId}" as appId, "${appId}" will be used instead`)
    }

    return appId == null ? generateDefaultAppId() : appId
  }

  get name(): string {
    return this.metadata.name!
  }

  get copyright(): string {
    const copyright = this.config.copyright
    if (copyright != null) {
      return copyright
    }
    return `Copyright © ${new Date().getFullYear()} ${this.metadata.author!.name || this.productName}`
  }

  async computePackageUrl(): Promise<string | null> {
    const url = this.metadata.homepage
    if (url != null) {
      return url
    }

    const info = await this.info.repositoryInfo
    return info == null || info.type !== "github"  ? null : `https://${info.domain}/${info.user}/${info.project}`
  }
}