import { isEmptyOrSpaces, log, smarten } from "builder-util"
import sanitizeFileName from "sanitize-filename"
import { prerelease, SemVer } from "semver"
import { Packager } from "./packager"

export class AppInfo {
  readonly description = smarten(this.info.metadata.description || "")
  readonly version: string

  readonly buildNumber: string | undefined
  readonly buildVersion: string

  readonly productName: string
  readonly productFilename: string

  constructor(private readonly info: Packager, buildVersion?: string | null) {
    this.version = info.metadata.version!

    if (buildVersion == null) {
      buildVersion = info.config.buildVersion
    }

    this.buildNumber = process.env.BUILD_NUMBER || process.env.TRAVIS_BUILD_NUMBER || process.env.APPVEYOR_BUILD_NUMBER || process.env.CIRCLE_BUILD_NUM || process.env.BUILD_BUILDNUMBER
    if (buildVersion == null) {
      buildVersion = this.version
      if (!isEmptyOrSpaces(this.buildNumber)) {
        buildVersion += `.${this.buildNumber}`
      }
    }
    this.buildVersion = buildVersion

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
    // https://github.com/electron-userland/electron-builder/issues/2635#issuecomment-371792272
    let buildNumber = this.buildNumber
    if (buildNumber == null || !/^\d+$/.test(buildNumber)) {
      buildNumber = "0"
    }
    return `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}.${buildNumber}`
  }

  private get notNullDevMetadata() {
    return this.info.devMetadata || {}
  }

  get companyName(): string | null {
    const author = this.info.metadata.author || this.notNullDevMetadata.author
    return author == null ? null : author.name
  }

  get id(): string {
    let appId
    if (this.info.config.appId != null) {
      appId = this.info.config.appId
    }

    const generateDefaultAppId = () => {
      const info = this.info
      return `${info.framework.defaultAppIdPrefix}${info.metadata.name!.toLowerCase()}`
    }

    if (appId != null && (appId === "your.id" || isEmptyOrSpaces(appId))) {
      const incorrectAppId = appId
      appId = generateDefaultAppId()
      log.warn(`do not use "${incorrectAppId}" as appId, "${appId}" will be used instead`)
    }

    return appId == null ? generateDefaultAppId() : appId
  }

  get macBundleIdentifier(): string {
    return filterCFBundleIdentifier(this.id)
  }

  get name(): string {
    return this.info.metadata.name!
  }

  get sanitizedName(): string {
    return sanitizeFileName(this.name)
  }

  get copyright(): string {
    const copyright = this.info.config.copyright
    if (copyright != null) {
      return copyright
    }
    return `Copyright © ${new Date().getFullYear()} ${this.companyName || this.productName}`
  }

  async computePackageUrl(): Promise<string | null> {
    const url = this.info.metadata.homepage || this.notNullDevMetadata.homepage
    if (url != null) {
      return url
    }

    const info = await this.info.repositoryInfo
    return info == null || info.type !== "github"  ? null : `https://${info.domain}/${info.user}/${info.project}`
  }
}

/** @internal */
export function filterCFBundleIdentifier(identifier: string) {
  // Remove special characters and allow only alphanumeric (A-Z,a-z,0-9), hyphen (-), and period (.)
  // Apple documentation: https://developer.apple.com/library/mac/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070
  return identifier.replace(/ /g, "-").replace(/[^a-zA-Z0-9.-]/g, "")
}