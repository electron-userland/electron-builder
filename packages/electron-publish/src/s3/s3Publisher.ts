import { InvalidConfigurationError, log } from "builder-util"
import { S3Options } from "builder-util-runtime"
<<<<<<< HEAD
import { PublishContext } from "../index.js"
import { resolveAwsCredentials } from "./awsCredentials.js"
import { BaseS3Publisher, S3UploadConfig, S3UploadExtraParams } from "./baseS3Publisher.js"
import { getBucketLocation } from "./bucketLocation.js"
=======
import { PublishContext } from ".."
import { BaseS3Publisher } from "./baseS3Publisher.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)

export class S3Publisher extends BaseS3Publisher {
  readonly providerName = "s3"

  constructor(
    context: PublishContext,
    private readonly info: S3Options
  ) {
    super(context, info)
  }

  static async checkAndResolveOptions(options: S3Options, channelFromAppVersion: string | null, errorIfCannot: boolean) {
    const bucket = options.bucket
    if (bucket == null) {
      throw new InvalidConfigurationError(`Please specify "bucket" for "s3" publish provider`)
    }

    if (options.endpoint == null && bucket.includes(".") && options.region == null) {
      // on dotted bucket names, we need to use a path-based endpoint URL. Path-based endpoint URLs need to include the region.
      try {
        options.region = await getBucketLocation(bucket)
      } catch (e: any) {
        if (errorIfCannot) {
          throw e
        } else {
          log.warn(`cannot compute region for bucket (required because on dotted bucket names, we need to use a path-based endpoint URL): ${e}`)
        }
      }
    }

    if (options.channel == null && channelFromAppVersion != null) {
      options.channel = channelFromAppVersion
    }

    if (options.endpoint != null && options.endpoint.endsWith("/")) {
      ;(options as any).endpoint = options.endpoint.slice(0, -1)
    }
  }

  protected getBucketName(): string {
    return this.info.bucket
  }

  public getS3UploadConfig(): S3UploadConfig {
    return {
      region: this.info.region ?? "us-east-1",
      endpoint: this.info.endpoint ?? undefined,
      forcePathStyle: this.info.forcePathStyle ?? undefined,
      credentials: resolveAwsCredentials(),
    }
  }

  public getUploadExtraParams(): S3UploadExtraParams {
    const base = super.getUploadExtraParams()
    return {
      ...base,
      storageClass: this.info.storageClass ?? undefined,
      serverSideEncryption: this.info.encryption ?? undefined,
    }
  }

  toString() {
    const result = super.toString()
    const endpoint = this.info.endpoint
    if (endpoint != null) {
      return result.substring(0, result.length - 1) + `, endpoint: ${endpoint})`
    }
    return result
  }
}
