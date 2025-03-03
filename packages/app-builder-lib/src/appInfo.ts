import { isEmptyOrSpaces, log } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { sanitizeFileName } from "builder-util/out/filename"
import { prerelease } from "semver"
import { PlatformSpecificBuildOptions } from "./options/PlatformSpecificBuildOptions"
import { Packager } from "./packager"
import { expandMacro } from "./util/macroExpander"

// fpm bug - rpm build --description is not escaped, well... decided to replace quite to smart quote
// http://leancrew.com/all-this/2010/11/smart-quotes-in-javascript/
export function smarten(s: string): string {
  // opening singles
  s = s.replace(/(^|[-\u2014\s(["])'/g, "$1\u2018")
  // closing singles & apostrophes
  s = s.replace(/'/g, "\u2019")
  // opening doubles
  s = s.replace(/(^|[-\u2014/[(\u2018\s])"/g, "$1\u201c")
  // closing doubles
  s = s.replace(/"/g, "\u201d")
  return s
}

export class AppInfo {
  readonly description = smarten(this.info.metadata.description || "")
  readonly version: string
  readonly type: string | undefined
  readonly shortVersion: string | undefined
  readonly shortVersionWindows: string | undefined

  readonly buildNumber: string | undefined
  readonly buildVersion: string

  readonly productName: string
  readonly sanitizedProductName: string
  readonly productFilename: string

  constructor(
    private readonly info: Packager,
    buildVersion: string | Nullish,
    private readonly platformSpecificOptions: PlatformSpecificBuildOptions | null = null,
    normalizeNfd = false
  ) {
    this.version = info.metadata.version!
    this.type = info.metadata.type

    if (buildVersion == null) {
      buildVersion = info.config.buildVersion
    }

    const buildNumberEnvs =
      process.env.BUILD_NUMBER ||
      process.env.TRAVIS_BUILD_NUMBER ||
      process.env.APPVEYOR_BUILD_NUMBER ||
      process.env.CIRCLE_BUILD_NUM ||
      process.env.BUILD_BUILDNUMBER ||
      process.env.CI_PIPELINE_IID
    this.buildNumber = info.config.buildNumber || buildNumberEnvs
    if (buildVersion == null) {
      buildVersion = this.version
      if (!isEmptyOrSpaces(this.buildNumber)) {
        buildVersion += `.${this.buildNumber}`
      }
    }
    this.buildVersion = buildVersion

    if (info.metadata.shortVersion) {
      this.shortVersion = info.metadata.shortVersion
    }
    if (info.metadata.shortVersionWindows) {
      this.shortVersionWindows = info.metadata.shortVersionWindows
    }

    this.productName = info.config.productName || info.metadata.productName || info.metadata.name!
    this.sanitizedProductName = sanitizeFileName(this.productName, normalizeNfd)

    const executableName = platformSpecificOptions?.executableName ?? info.config.executableName
    this.productFilename = executableName != null ? sanitizeFileName(executableName, normalizeNfd) : this.sanitizedProductName
  }

  get channel(): string | null {
    const prereleaseInfo = prerelease(this.version)
    if (prereleaseInfo != null && prereleaseInfo.length > 0) {
      return prereleaseInfo[0] as string | null
    }
    return null
  }

  getVersionInWeirdWindowsForm(isSetBuildNumber = true): string {
    const [major, maybe_minor, maybe_patch] = this.version.split(".").map(versionPart => parseInt(versionPart))
    // The major component must be present. Here it can be either NaN or undefined, which
    // both returns true from isNaN.
    if (isNaN(major)) {
      throw new Error(`Invalid major number in: ${this.version}`)
    }
    // Allow missing version parts. Minor and patch can be left out and default to zero
    const minor = maybe_minor ?? 0
    const patch = maybe_patch ?? 0
    // ... but reject non-integer version parts. '1.a' is not going to fly
    if (isNaN(minor) || isNaN(patch)) {
      throw new Error(`Invalid minor or patch number in: ${this.version}`)
    }
    // https://github.com/electron-userland/electron-builder/issues/2635#issuecomment-371792272
    let buildNumber = isSetBuildNumber ? this.buildNumber : null
    if (buildNumber == null || !/^\d+$/.test(buildNumber)) {
      buildNumber = "0"
    }
    return `${major}.${minor}.${patch}.${buildNumber}`
  }

  private get notNullDevMetadata() {
    return this.info.devMetadata || {}
  }

  get companyName(): string | null {
    const author = this.info.metadata.author || this.notNullDevMetadata.author
    return author == null ? null : author.name
  }

  get id(): string {
    let appId: string | Nullish = null
    for (const options of [this.platformSpecificOptions, this.info.config]) {
      if (options != null && appId == null) {
        appId = options.appId
      }
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

  get linuxPackageName(): string {
    const name = this.name
    // https://github.com/electron-userland/electron-builder/issues/2963
    return name.startsWith("@") ? this.sanitizedProductName : name
  }

  get sanitizedName(): string {
    return sanitizeFileName(this.name)
  }

  get updaterCacheDirName(): string {
    return this.sanitizedName.toLowerCase() + "-updater"
  }

  get copyright(): string {
    const copyright = this.info.config.copyright
    if (copyright != null) {
      return expandMacro(copyright, null, this)
    }
    return `Copyright © ${new Date().getFullYear()} ${this.companyName || this.productName}`
  }

  async computePackageUrl(): Promise<string | null> {
    const url = this.info.metadata.homepage || this.notNullDevMetadata.homepage
    if (url != null) {
      return url
    }

    const info = await this.info.repositoryInfo
    return info == null || info.type !== "github" ? null : `https://${info.domain}/${info.user}/${info.project}`
  }
}

/** @internal */
export function filterCFBundleIdentifier(identifier: string) {
  // Remove special characters and allow only alphanumeric (A-Z,a-z,0-9), hyphen (-), and period (.)
  // Apple documentation: https://developer.apple.com/library/mac/documentation/General/Reference/InfoPlistKeyReference/Articles/CoreFoundationKeys.html#//apple_ref/doc/uid/20001431-102070
  return identifier.replace(/ /g, "-").replace(/[^a-zA-Z0-9.-]/g, "")
}
