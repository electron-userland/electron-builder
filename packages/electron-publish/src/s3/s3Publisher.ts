import { InvalidConfigurationError, log } from "builder-util"
import { S3Options } from "builder-util-runtime"
import { PublishContext } from "../index.js"
import { AwsCredentials, memoizeAwsCredentials, resolveS3Credentials, validateS3CredentialsOptions } from "./awsCredentials.js"
import { BaseS3Publisher, S3UploadConfig, S3UploadExtraParams } from "./baseS3Publisher.js"
import { getBucketLocation } from "./bucketLocation.js"

// Bucket regions looked up while publishing, reused by later (non-publish) option resolution in the same process, e.g.
// the app-update.yml of AppImage/deb/rpm targets. A region never changes for a bucket; failed lookups are evicted.
const bucketRegions = new Map<string, Promise<string>>()
const bucketsWarnedAboutRegion = new Set<string>()

export class S3Publisher extends BaseS3Publisher {
  readonly providerName = "s3"

  private readonly credentials: () => Promise<AwsCredentials>

  constructor(
    context: PublishContext,
    private readonly info: S3Options
  ) {
    super(context, info)
    this.credentials = memoizeAwsCredentials(() => resolveS3Credentials(info.awsCredentials))
  }

  static async checkAndResolveOptions(options: S3Options, channelFromAppVersion: string | null, errorIfCannot: boolean) {
    const bucket = options.bucket
    if (bucket == null) {
      throw new InvalidConfigurationError(`Please specify "bucket" for "s3" publish provider`)
    }

    if (errorIfCannot) {
      // publishing: fail fast when no credential source is chosen (only the config shape is checked, nothing is read)
      validateS3CredentialsOptions(options.awsCredentials)
    }

    if (options.endpoint == null && bucket.includes(".") && options.region == null) {
      // on dotted bucket names, we need to use a path-based endpoint URL. Path-based endpoint URLs need to include the region.
      const region = await S3Publisher.resolveBucketRegion(options, errorIfCannot)
      if (region != null) {
        options.region = region
      }
    }

    if (options.channel == null && channelFromAppVersion != null) {
      options.channel = channelFromAppVersion
    }

    if (options.endpoint != null && options.endpoint.endsWith("/")) {
      ;(options as any).endpoint = options.endpoint.slice(0, -1)
    }
  }

  private static async resolveBucketRegion(options: S3Options, errorIfCannot: boolean): Promise<string | null> {
    const bucket = options.bucket
    let lookup = bucketRegions.get(bucket)
    if (lookup == null) {
      if (!errorIfCannot) {
        // Not publishing: never resolve credentials here (that could run credential_process or call SSO/STS).
        if (!bucketsWarnedAboutRegion.has(bucket)) {
          bucketsWarnedAboutRegion.add(bucket)
          log.warn(
            { bucket },
            `S3 region is not set for a bucket name containing dots (a path-style endpoint URL that includes the region is required) and is not looked up when not publishing; set "region" in the s3 publish configuration`
          )
        }
        return null
      }
      lookup = resolveS3Credentials(options.awsCredentials).then(credentials => getBucketLocation(bucket, credentials))
      bucketRegions.set(bucket, lookup)
      lookup.catch(() => bucketRegions.delete(bucket))
    }

    try {
      return await lookup
    } catch (e: any) {
      if (errorIfCannot) {
        throw e
      }
      log.warn(`cannot compute region for bucket (required because on dotted bucket names, we need to use a path-based endpoint URL): ${e}`)
      return null
    }
  }

  protected getBucketName(): string {
    return this.info.bucket
  }

  public async getS3UploadConfig(): Promise<S3UploadConfig> {
    return {
      region: this.info.region ?? "us-east-1",
      endpoint: this.info.endpoint ?? undefined,
      forcePathStyle: this.info.forcePathStyle ?? undefined,
      credentials: await this.credentials(),
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
