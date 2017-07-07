export type PublishProvider = "github" | "bintray" | "s3" | "generic"

// typescript-json-schema generates only PublishConfiguration if it is specified in the list, so, it is not added here
export type AllPublishOptions = string | GithubOptions | S3Options | GenericServerOptions | BintrayOptions
// https://github.com/YousefED/typescript-json-schema/issues/80
export type Publish = AllPublishOptions | Array<AllPublishOptions> | null

export interface PublishConfiguration {
  /**
   * The provider.
   */
  readonly provider: PublishProvider
}

/**
 * GitHub options.
 * 
 * GitHub [personal access token](https://help.github.com/articles/creating-an-access-token-for-command-line-use/) is required. You can generate by going to [https://github.com/settings/tokens/new](https://github.com/settings/tokens/new). The access token should have the repo scope/permission.
 * Define `GH_TOKEN` environment variable.
 */
export interface GithubOptions extends PublishConfiguration {
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
   * The access token to support auto-update from private github repositories. Never specify it in the configuration files. Only for [setFeedURL](module:electron-updater/out/AppUpdater.AppUpdater+setFeedURL).
   */
  readonly token?: string | null

  /**
   * Whether to use private github auto-update provider if `GH_TOKEN` environment variable is set.
   * @see https://github.com/electron-userland/electron-builder/wiki/Auto-Update#private-github-update-repo 
   */
  readonly private?: boolean | null
}

/** @private */
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
 * 
 * AWS credentials are required, please see [getting your credentials](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/getting-your-credentials.html).
 * Define `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` [environment variables](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-environment.html).
 * Or in the [~/.aws/credentials](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html).
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

/** @private */
export function s3Url(options: S3Options) {
  let url: string
  if (!options.bucket.includes(".")) {
    if (options.region === "cn-north-1") {
            url = `https://${options.bucket}.s3.${options.region}.amazonaws.com.cn`;
        } else {
            url = `https://${options.bucket}.s3.amazonaws.com`;
        }
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
   * The owner.
   */
  readonly owner?: string | null

  /**
   * The Bintray user account. Used in cases where the owner is an organization.
   */
  readonly user?: string | null

  readonly token?: string | null
}
