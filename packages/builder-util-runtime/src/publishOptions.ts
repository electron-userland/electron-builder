import { OutgoingHttpHeaders } from "http"

export type PublishProvider = "github" | "bintray" | "s3" | "spaces" | "generic" | "custom" | "snapStore" | "keygen" | "bitbucket"

// typescript-json-schema generates only PublishConfiguration if it is specified in the list, so, it is not added here
export type AllPublishOptions =
  | string
  | GithubOptions
  | S3Options
  | SpacesOptions
  | GenericServerOptions
  | BintrayOptions
  | CustomPublishOptions
  | KeygenOptions
  | SnapStoreOptions
  | BitbucketOptions

export interface PublishConfiguration {
  /**
   * The provider.
   */
  readonly provider: PublishProvider

  /**
   * @private
   * win-only
   */
  publisherName?: Array<string> | null

  /**
   * @private
   * win-only
   */
  readonly updaterCacheDirName?: string | null

  /**
   * Whether to publish auto update info files.
   *
   * Auto update relies only on the first provider in the list (you can specify several publishers).
   * Thus, probably, there`s no need to upload the metadata files for the other configured providers. But by default will be uploaded.
   *
   * @default true
   */
  readonly publishAutoUpdate?: boolean

  /**
   * Any custom request headers
   */
  readonly requestHeaders?: OutgoingHttpHeaders
}

// https://github.com/electron-userland/electron-builder/issues/3261
export interface CustomPublishOptions extends PublishConfiguration {
  /**
   * The provider. Must be `custom`.
   */
  readonly provider: "custom"

  /**
   * The Provider to provide UpdateInfo regarding available updates.  Required
   * to use custom providers with electron-updater.
   */
  updateProvider?: new (options: CustomPublishOptions, updater: any, runtimeOptions: any) => any

  [index: string]: any
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
   * The access token to support auto-update from private github repositories. Never specify it in the configuration files. Only for [setFeedURL](/auto-update#appupdatersetfeedurloptions).
   */
  readonly token?: string | null

  /**
   * Whether to use private github auto-update provider if `GH_TOKEN` environment variable is defined. See [Private GitHub Update Repo](/auto-update#private-github-update-repo).
   */
  readonly private?: boolean | null

  /**
   * The channel.
   * @default latest
   */
  readonly channel?: string | null

  /**
   * The type of release. By default `draft` release will be created.
   *
   * Also you can set release type using environment variable. If `EP_DRAFT`is set to `true` — `draft`, if `EP_PRE_RELEASE`is set to `true` — `prerelease`.
   * @default draft
   */
  releaseType?: "draft" | "prerelease" | "release" | null
}

/** @private */
export function githubUrl(options: GithubOptions, defaultHost = "github.com") {
  return `${options.protocol || "https"}://${options.host || defaultHost}`
}

/**
 * Generic (any HTTP(S) server) options.
 * In all publish options [File Macros](/file-patterns#file-macros) are supported.
 */
export interface GenericServerOptions extends PublishConfiguration {
  /**
   * The provider. Must be `generic`.
   */
  readonly provider: "generic"

  /**
   * The base url. e.g. `https://bucket_name.s3.amazonaws.com`.
   */
  readonly url: string

  /**
   * The channel.
   * @default latest
   */
  readonly channel?: string | null

  /**
   * Whether to use multiple range requests for differential update. Defaults to `true` if `url` doesn't contain `s3.amazonaws.com`.
   */
  readonly useMultipleRangeRequest?: boolean
}

/**
 * Keygen options.
 * https://keygen.sh/
 * Define `KEYGEN_TOKEN` environment variable.
 */
export interface KeygenOptions extends PublishConfiguration {
  /**
   * The provider. Must be `keygen`.
   */
  readonly provider: "keygen"

  /**
   * Keygen account's UUID
   */
  readonly account: string

  /**
   * Keygen product's UUID
   */
  readonly product: string

  /**
   * The channel.
   * @default stable
   */
  readonly channel?: "stable" | "rc" | "beta" | "alpha" | "dev" | null

  /**
   * The target Platform. Is set programmatically explicitly during publishing.
   */
  readonly platform?: string | null
}

/**
 * Bitbucket options.
 * https://bitbucket.org/
 * Define `BITBUCKET_TOKEN` environment variable.
 *
 * For converting an app password to a usable token, you can utilize this
```typescript
convertAppPassword(owner: string, token: string) {
  const base64encodedData = Buffer.from(`${owner}:${token.trim()}`).toString("base64")
  return `Basic ${base64encodedData}`
}
```
 */
export interface BitbucketOptions extends PublishConfiguration {
  /**
   * The provider. Must be `bitbucket`.
   */
  readonly provider: "bitbucket"

  /**
   * Repository owner
   */
  readonly owner: string

  /**
   * The access token to support auto-update from private bitbucket repositories.
   */
  readonly token?: string | null

  /**
   * The user name to support auto-update from private bitbucket repositories.
   */
  readonly username?: string | null

  /**
   * Repository slug/name
   */
  readonly slug: string

  /**
   * The channel.
   * @default latest
   */
  readonly channel?: string | null
}

/**
 * [Snap Store](https://snapcraft.io/) options.
 */
export interface SnapStoreOptions extends PublishConfiguration {
  /**
   * The provider. Must be `snapStore`.
   */
  readonly provider: "snapStore"

  /**
   * snapcraft repo name
   */
  readonly repo?: string

  /**
   * The list of channels the snap would be released.
   * @default ["edge"]
   */
  readonly channels?: string | Array<string> | null
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

/**
 * [Amazon S3](https://aws.amazon.com/s3/) options.
 * AWS credentials are required, please see [getting your credentials](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/getting-your-credentials.html).
 * Define `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` [environment variables](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-environment.html).
 * Or in the [~/.aws/credentials](http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html).
 *
 * Example configuration:
 *
```json
{
  "build":
    "publish": {
      "provider": "s3",
      "bucket": "bucket-name"
    }
  }
}
```
 */
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

  /**
   * Server-side encryption algorithm to use for the object.
   */
  readonly encryption?: "AES256" | "aws:kms" | null

  /**
   * The endpoint URI to send requests to. The default endpoint is built from the configured region.
   * The endpoint should be a string like `https://{service}.{region}.amazonaws.com`.
   */
  readonly endpoint?: string | null
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
    return s3Url(configuration as S3Options)
  }
  if (provider === "spaces") {
    return spacesUrl(configuration as SpacesOptions)
  }
  throw new Error(`Not supported provider: ${provider}`)
}

function s3Url(options: S3Options) {
  let url: string
  if (options.endpoint != null) {
    url = `${options.endpoint}/${options.bucket}`
  } else if (options.bucket.includes(".")) {
    if (options.region == null) {
      throw new Error(`Bucket name "${options.bucket}" includes a dot, but S3 region is missing`)
    }

    // special case, see http://docs.aws.amazon.com/AmazonS3/latest/dev/UsingBucket.html#access-bucket-intro
    if (options.region === "us-east-1") {
      url = `https://s3.amazonaws.com/${options.bucket}`
    } else {
      url = `https://s3-${options.region}.amazonaws.com/${options.bucket}`
    }
  } else if (options.region === "cn-north-1") {
    url = `https://${options.bucket}.s3.${options.region}.amazonaws.com.cn`
  } else {
    url = `https://${options.bucket}.s3.amazonaws.com`
  }
  return appendPath(url, options.path)
}

function appendPath(url: string, p: string | null | undefined): string {
  if (p != null && p.length > 0) {
    if (!p.startsWith("/")) {
      url += "/"
    }
    url += p
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
  return appendPath(`https://${options.name}.${options.region}.digitaloceanspaces.com`, options.path)
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
