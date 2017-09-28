export type PublishProvider = "github" | "bintray" | "s3" | "spaces" | "generic"

// typescript-json-schema generates only PublishConfiguration if it is specified in the list, so, it is not added here
export type AllPublishOptions = string | GithubOptions | S3Options | SpacesOptions | GenericServerOptions | BintrayOptions
// https://github.com/YousefED/typescript-json-schema/issues/80
export type Publish = AllPublishOptions | Array<AllPublishOptions> | null

export interface PublishConfiguration {
  /**
   * The provider.
   */
  readonly provider: PublishProvider

  /**
   * @private
   */
  readonly publisherName?: Array<string> | null
}

/**
 * [GitHub](https://help.github.com/articles/about-releases/) options.
 *
 * GitHub [personal access token](https://help.github.com/articles/creating-an-access-token-for-command-line-use/) is required. You can generate by going to [https://github.com/settings/tokens/new](https://github.com/settings/tokens/new). The access token should have the repo scope/permission.
 * Define `GH_TOKEN` environment variable.
 */
export interface GithubOptions extends PublishConfiguration {
  /**
   * The provider. Must be `github`.
   */
  readonly provider: "github"

  /**
   * The repository name. [Detected automatically](#github-repository-and-bintray-package).
   */
  readonly repo?: string | null

  /**
   * The owner.
   */
  readonly owner?: string | null

  /**
   * Whether to use `v`-prefixed tag name.
   * @default true
   */
  readonly vPrefixedTagName?: boolean

  /**
   * The host (including the port if need).
   * @default github.com
   */
  readonly host?: string | null

  /**
   * The protocol. GitHub Publisher supports only `https`.
   * @default https
   */
  readonly protocol?: "https" | "http" | null

  /**
   * The access token to support auto-update from private github repositories. Never specify it in the configuration files. Only for [setFeedURL](/auto-update.md#appupdatersetfeedurloptions).
   */
  readonly token?: string | null

  /**
   * Whether to use private github auto-update provider if `GH_TOKEN` environment variable is defined. See [Private GitHub Update Repo](/auto-update.md#private-github-update-repo).
   */
  readonly private?: boolean | null

  /**
   * The type of release. By default `draft` release will be created.
   *
   * Also you can set release type using environment variable. If `EP_DRAFT`is set to `true` — `draft`, if `EP_PRELEASE`is set to `true` — `prerelease`.
   * @default draft
   */
  releaseType?: "draft" | "prerelease" | "release" | null
}

/** @private */
export function githubUrl(options: GithubOptions, defaultHost: string = "github.com") {
  return `${options.protocol || "https"}://${options.host || defaultHost}`
}

/**
 * Generic (any HTTP(S) server) options.
 */
export interface GenericServerOptions extends PublishConfiguration {
  /**
   * The provider. Must be `generic`.
   */
  readonly provider: "generic"

  /**
   * The base url. e.g. `https://bucket_name.s3.amazonaws.com`. You can use `${os}` (expanded to `mac`, `linux` or `win` according to target platform) and `${arch}` macros.
   */
  readonly url: string

  /**
   * The channel.
   * @default latest
   */
  readonly channel?: string | null
}

export interface BaseS3Options extends PublishConfiguration {
  /**
   * The update channel.
   * @default latest
   */
  channel?: string | null

  /**
   * The directory path.
   * @default /
   */
  readonly path?: string | null

  /**
   * The ACL. Set to `null` to not [add](https://github.com/electron-userland/electron-builder/issues/1822).
   *
   * @default public-read
   */
  readonly acl?: "private" | "public-read" | null
}

export interface S3Options extends BaseS3Options {
  /**
   * The provider. Must be `s3`.
   */
  readonly provider: "s3"

  /**
   * The bucket name.
   */
  readonly bucket: string

  /**
   * The region. Is determined and set automatically when publishing.
   */
  region?: string | null

  /**
   * The ACL. Set to `null` to not [add](https://github.com/electron-userland/electron-builder/issues/1822).
   *
   * Please see [required permissions for the S3 provider](https://github.com/electron-userland/electron-builder/issues/1618#issuecomment-314679128).
   *
   * @default public-read
   */
  readonly acl?: "private" | "public-read" | null

  /**
   * The type of storage to use for the object.
   * @default STANDARD
   */
  readonly storageClass?: "STANDARD" | "REDUCED_REDUNDANCY" | "STANDARD_IA" | null
}

/**
 * [DigitalOcean Spaces](https://www.digitalocean.com/community/tutorials/an-introduction-to-digitalocean-spaces) options.
 * Access key is required, define `DO_KEY_ID` and `DO_SECRET_KEY` environment variables.
 */
export interface SpacesOptions extends BaseS3Options {
  /**
   * The provider. Must be `spaces`.
   */
  readonly provider: "spaces"

  /**
   * The space name.
   */
  readonly name: string

  /**
   * The region (e.g. `nyc3`).
   */
  readonly region: string
}

export function getS3LikeProviderBaseUrl(configuration: PublishConfiguration) {
  const provider = configuration.provider
  if (provider === "s3") {
    return s3Url((configuration as S3Options))
  }
  if (provider === "spaces") {
    return spacesUrl((configuration as SpacesOptions))
  }
  throw new Error(`Not supported provider: ${provider}`)
}

function s3Url(options: S3Options) {
  let url: string
  if (!options.bucket.includes(".")) {
    if (options.region === "cn-north-1") {
      url = `https://${options.bucket}.s3.${options.region}.amazonaws.com.cn`
    }
    else {
      url = `https://${options.bucket}.s3.amazonaws.com`
    }
  }
  else {
    if (options.region == null) {
      throw new Error(`Bucket name "${options.bucket}" includes a dot, but S3 region is missing`)
    }

    // special case, see http://docs.aws.amazon.com/AmazonS3/latest/dev/UsingBucket.html#access-bucket-intro
    url = options.region === "us-east-1"
      ? `https://s3.amazonaws.com/${options.bucket}`
      : `https://s3-${options.region}.amazonaws.com/${options.bucket}`
  }

  if (options.path != null) {
    url += `/${options.path}`
  }
  return url
}

function spacesUrl(options: SpacesOptions) {
  if (options.name == null) {
    throw new Error(`name is missing`)
  }
  if (options.region == null) {
    throw new Error(`region is missing`)
  }

  let url = `https://${options.name}.${options.region}.digitaloceanspaces.com`
  if (options.path != null) {
    url += `/${options.path}`
  }
  return url
}

/**
 * [Bintray](https://bintray.com/) options. Requires an API key. An API key can be obtained from the user [profile](https://bintray.com/profile/edit) page ("Edit Your Profile" -> API Key).
 * Define `BT_TOKEN` environment variable.
 */
export interface BintrayOptions extends PublishConfiguration {
  /**
   * The provider. Must be `bintray`.
   */
  readonly provider: "bintray"

  /**
   * The Bintray package name.
   */
  readonly package?: string | null

  /**
   * The Bintray repository name.
   * @default generic
   */
  readonly repo?: string | null

  /**
   * The owner.
   */
  readonly owner?: string | null

  /**
   * The Bintray component (Debian only).
   */
  readonly component?: string | null

  /**
   * The Bintray distribution (Debian only).
   * @default stable
   */
  readonly distribution?: string | null

  /**
   * The Bintray user account. Used in cases where the owner is an organization.
   */
  readonly user?: string | null

  readonly token?: string | null
}
