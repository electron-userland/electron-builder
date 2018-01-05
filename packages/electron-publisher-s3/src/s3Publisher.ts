import S3, { ClientConfiguration, StorageClass, ServerSideEncryption } from "aws-sdk/clients/s3"
import { S3Options } from "builder-util-runtime"
import { PublishContext } from "electron-publish"
import { BaseS3Publisher } from "./BaseS3Publisher"

export default class S3Publisher extends BaseS3Publisher {
  readonly providerName = "S3"

  constructor(context: PublishContext, private readonly info: S3Options) {
    super(context, info)
  }

  static async checkAndResolveOptions(options: S3Options, channelFromAppVersion: string | null) {
    const bucket = options.bucket
    if (bucket == null) {
      throw new Error(`Please specify "bucket" for "s3" publish provider`)
    }

    if (options.endpoint == null && (bucket.includes(".") && options.region == null)) {
      // on dotted bucket names, we need to use a path-based endpoint URL. Path-based endpoint URLs need to include the region.
      const s3 = new S3({signatureVersion: "v4"})
      options.region = (await s3.getBucketLocation({Bucket: bucket}).promise()).LocationConstraint
    }

    if (options.channel == null && channelFromAppVersion != null) {
      options.channel = channelFromAppVersion
    }
  }

  protected createClientConfiguration(): ClientConfiguration {
    const configuration = super.createClientConfiguration()
    const endpoint = this.info.endpoint
    if (endpoint != null) {
      configuration.endpoint = endpoint
      configuration.s3ForcePathStyle = true
    }
    return configuration
  }

  protected getBucketName(): string {
    return this.info.bucket!
  }

  protected configureS3Options(s3Options: S3.CreateMultipartUploadRequest): void {
    super.configureS3Options(s3Options)

    if (this.info.storageClass != null) {
      s3Options.StorageClass = this.info.storageClass as StorageClass
    }

    if (this.info.encryption != null) {
      s3Options.ServerSideEncryption = this.info.encryption as ServerSideEncryption
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
