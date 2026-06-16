import { InvalidConfigurationError, isEmptyOrSpaces } from "builder-util"
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

  static checkAndResolveOptions(options: R2Options, channelFromAppVersion: string | null, _errorIfCannot: boolean) {
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
    return {
      // R2 has no per-region buckets; the S3-compatible API always expects region "auto".
      region: "auto",
      endpoint: `https://${this.info.accountId}.r2.cloudflarestorage.com`,
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
