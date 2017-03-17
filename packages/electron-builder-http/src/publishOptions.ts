export type PublishProvider = "github" | "bintray" | "s3" | "generic"

// typescript-json-schema generates only PublishConfiguration if it is specified in the list, so, it is not added here
export type AllPublishOptions = string | GithubOptions | S3Options | GenericServerOptions | BintrayOptions
// https://github.com/YousefED/typescript-json-schema/issues/80
export type Publish = AllPublishOptions | Array<AllPublishOptions> | null

/**
 * Can be specified in the [config](https://github.com/electron-userland/electron-builder/wiki/Options#Config) or any platform- or target- specific options.
 * 
 * If `GH_TOKEN` is set — defaults to `[{provider: "github"}]`.
 * 
 * If `BT_TOKEN` is set and `GH_TOKEN` is not set — defaults to `[{provider: "bintray"}]`.
 */
export interface PublishConfiguration {
  /**
   * The provider.
   */
  readonly provider: PublishProvider

  /**
   * The owner.
   */
  readonly owner?: string | null

  readonly token?: string | null
}

/**
 * GitHub options.
 */
export interface GithubOptions extends PublishConfiguration {
  /**
   * The repository name. [Detected automatically](#github-repository-and-bintray-package).
   */
  readonly repo?: string | null

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
   * The access token to support auto-update from private github repositories. Never specify it in the configuration files. Only for [setFeedURL](module:electron-updater/out/AppUpdater.AppUpdater+setFeedURL).
   */
  readonly token?: string | null
}

export function githubUrl(options: GithubOptions) {
  return `${options.protocol || "https"}://${options.host || "github.com"}`
}

/**
 * Generic (any HTTP(S) server) options.
 */
export interface GenericServerOptions extends PublishConfiguration {
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

/**
 * Amazon S3 options. `https` must be used, so, if you use direct Amazon S3 endpoints, format `https://s3.amazonaws.com/bucket_name` [must be used](http://stackoverflow.com/a/11203685/1910191). And do not forget to make files/directories public.
 * @see [Getting your credentials](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/getting-your-credentials.html).
 */
export interface S3Options extends PublishConfiguration {
  /**
   * The bucket name.
   */
  readonly bucket: string

  /**
   * The directory path.
   * @default /
   */
  readonly path?: string | null

  /**
   * The region. Is determined and set automatically when publishing.
   */
  readonly region?: string | null

  /**
   * The channel.
   * @default latest
   */
  readonly channel?: string | null

  /**
   * The ACL.
   * @default public-read
   */
  readonly acl?: "private" | "public-read" | null

  /**
   * The type of storage to use for the object.
   * @default STANDARD
   */
  readonly storageClass?: "STANDARD" | "REDUCED_REDUNDANCY" | "STANDARD_IA" | null
}

export function s3Url(options: S3Options) {
  let url: string
  if (!options.bucket.includes(".")) {
    url = `https://${options.bucket}.s3.amazonaws.com`
  } 
  else {
    if (!options.region) {
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

/**
 * Bintray options.
 */
export interface BintrayOptions extends PublishConfiguration {
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
   * The Bintray user account. Used in cases where the owner is an organization.
   */
  readonly user?: string | null
}

export interface VersionInfo {
  /**
   * The version.
   */
  readonly version: string
}

export interface UpdateInfo extends VersionInfo {
  readonly path: string
  readonly githubArtifactName?: string | null
  readonly sha2: string

  /**
   * The release name.
   */
  readonly releaseName?: string | null
  /**
   * The release notes.
   */
  readonly releaseNotes?: string | null
  /**
   * The release date.
   */
  readonly releaseDate: string
}