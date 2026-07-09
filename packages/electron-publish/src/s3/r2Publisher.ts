import { InvalidConfigurationError, isEmptyOrSpaces, log } from "builder-util"
import { R2Options } from "builder-util-runtime"
import { PublishContext } from "../index.js"
import { BaseS3Publisher, S3UploadConfig, S3UploadExtraParams } from "./baseS3Publisher.js"

/**
 * Publishes to [Cloudflare R2](https://developers.cloudflare.com/r2/).
 *
 * Set `CF_R2_ACCESS_KEY_ID` and `CF_R2_SECRET_ACCESS_KEY` environment variables
 * to the R2 API token credentials (see https://developers.cloudflare.com/r2/api/s3/tokens/).
 */
export class R2Publisher extends BaseS3Publisher {
  readonly providerName = "r2"

  constructor(
    context: PublishContext,
    private readonly info: R2Options
  ) {
    super(context, info)
  }

  static checkAndResolveOptions(options: R2Options, channelFromAppVersion: string | null, errorIfCannot: boolean) {
    if (isEmptyOrSpaces(options.bucket)) {
      throw new InvalidConfigurationError(`Please specify "bucket" for "r2" publish provider (see https://www.electron.build/publish#r2options)`)
    }
    if (isEmptyOrSpaces(options.accountId)) {
      throw new InvalidConfigurationError(`Please specify "accountId" for "r2" publish provider (see https://www.electron.build/publish#r2options)`)
    }
    // Cloudflare account IDs are 32-character hex strings. Catching typos here produces a clear
    // error instead of a confusing DNS/connection failure at upload time.
    if (!/^[0-9a-f]{32}$/i.test(options.accountId)) {
      throw new InvalidConfigurationError(
        `"accountId" for "r2" publish provider must be a 32-character hexadecimal string (found: "${options.accountId}"). ` +
          `Check the R2 overview page in the Cloudflare dashboard.`
      )
    }

    // `publicUrl` is baked into app-update.yml and used by electron-updater on end-user machines
    // to download update metadata and binaries. Validate it here so a misconfigured (or injected)
    // value fails at build time rather than silently downgrading update transport for end users.
    // Unlike s3/spaces — whose download host is always an https URL synthesised by electron-builder —
    // R2's publicUrl is operator-supplied free text, so it must be checked explicitly.
    if (!isEmptyOrSpaces(options.publicUrl)) {
      let parsed: URL
      try {
        parsed = new URL(options.publicUrl)
      } catch {
        throw new InvalidConfigurationError(
          `"publicUrl" for "r2" publish provider must be a valid URL (found: "${options.publicUrl}"). ` +
            `Use your bucket's custom domain or r2.dev subdomain (see https://developers.cloudflare.com/r2/buckets/public-buckets/).`
        )
      }
      if (parsed.protocol !== "https:") {
        throw new InvalidConfigurationError(
          `"publicUrl" for "r2" publish provider must use https (found: "${options.publicUrl}"). ` +
            `electron-updater downloads updates from this URL on end-user machines; plaintext http is not allowed.`
        )
      }
    }

    // The schema enum already rejects unknown values for file-based configs; this guards
    // programmatic configs, since the value is interpolated into the endpoint hostname.
    if (options.jurisdiction != null && !["eu", "fedramp-moderate"].includes(options.jurisdiction)) {
      throw new InvalidConfigurationError(
        `"jurisdiction" for "r2" publish provider must be "eu" or "fedramp-moderate" (found: "${options.jurisdiction}"). ` +
          `It must match the jurisdiction the bucket was created with (see https://developers.cloudflare.com/r2/reference/data-location/#jurisdictional-restrictions).`
      )
    }

    // Without a publicUrl the generated app-update.yml would point electron-updater at the
    // S3 API endpoint, which on R2 always requires SigV4 authentication — end-user machines
    // have no credentials, so every update check would fail with 401 at runtime. Catch this
    // at build time instead of shipping a broken updater.
    if (isEmptyOrSpaces(options.publicUrl) && options.publishAutoUpdate !== false) {
      const message =
        `Please specify "publicUrl" for "r2" publish provider when "publishAutoUpdate" is not disabled (see https://www.electron.build/publish#r2options). ` +
        `R2's S3 API endpoint cannot serve unauthenticated downloads — public access requires an r2.dev subdomain or a custom domain ` +
        `(see https://developers.cloudflare.com/r2/buckets/public-buckets/). Set "publicUrl" to that base URL, or set "publishAutoUpdate": false if the app does not auto-update.`
      if (errorIfCannot) {
        throw new InvalidConfigurationError(message)
      } else {
        log.warn(message)
      }
    }

    if (options.channel == null && channelFromAppVersion != null) {
      options.channel = channelFromAppVersion
    }
    return Promise.resolve()
  }

  protected getBucketName(): string {
    return this.info.bucket
  }

  public getS3UploadConfig(): S3UploadConfig {
    const accessKey = process.env.CF_R2_ACCESS_KEY_ID
    const secretKey = process.env.CF_R2_SECRET_ACCESS_KEY
    if (isEmptyOrSpaces(accessKey)) {
      throw new InvalidConfigurationError("Please set env CF_R2_ACCESS_KEY_ID (see https://developers.cloudflare.com/r2/api/s3/tokens/)")
    }
    if (isEmptyOrSpaces(secretKey)) {
      throw new InvalidConfigurationError("Please set env CF_R2_SECRET_ACCESS_KEY (see https://developers.cloudflare.com/r2/api/s3/tokens/)")
    }
    // Jurisdictional buckets (e.g. "eu", "fedramp-moderate") are only reachable via
    // https://<accountId>.<jurisdiction>.r2.cloudflarestorage.com
    const jurisdiction = isEmptyOrSpaces(this.info.jurisdiction) ? "" : `${this.info.jurisdiction}.`
    return {
      // R2 has no per-region buckets; the S3-compatible API always expects region "auto".
      region: "auto",
      endpoint: `https://${this.info.accountId}.${jurisdiction}r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    }
  }

  public getUploadExtraParams(): S3UploadExtraParams {
    // R2 does not support S3 ACLs — never send the parent's default "public-read" ACL header.
    // Bucket-level public access is configured separately in the Cloudflare dashboard.
    return {
      acl: undefined,
    }
  }
}
