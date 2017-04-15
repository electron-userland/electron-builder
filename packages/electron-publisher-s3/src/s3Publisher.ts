import { S3 } from "aws-sdk"
import { S3Options } from "electron-builder-http/out/publishOptions"
import { debug } from "electron-builder-util"
import { PublishContext, Publisher } from "electron-publish"
import { ProgressCallback } from "electron-publish/out/progress"
import { stat } from "fs-extra-p"
import { basename } from "path"
import { S3Client } from "./uploader"

export default class S3Publisher extends Publisher {
  readonly providerName = "S3"

  constructor(context: PublishContext, private readonly info: S3Options) {
    super(context)

    debug(`Creating S3 Publisher — bucket: ${info.bucket}`)
  }

  static async checkAndResolveOptions(options: S3Options, channelFromAppVersion: string | null) {
    const bucket = options.bucket
    if (bucket == null) {
      throw new Error(`Please specify "bucket" for "s3" update server`)
    }
    
    if (bucket.includes(".") && options.region == null) {
      // on dotted bucket names, we need to use a path-based endpoint URL. Path-based endpoint URLs need to include the region.  
      const s3 = new S3({signatureVersion: "v4"});
      (<any>options).region = (await s3.getBucketLocation({Bucket: bucket}).promise()).LocationConstraint
    }

    if (options.channel == null && channelFromAppVersion != null) {
      (<any>options).channel = channelFromAppVersion
    }
  }
  
  // http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/s3-example-creating-buckets.html
  async upload(file: string, safeArtifactName?: string): Promise<any> {
    const fileName = basename(file)
    const fileStat = await stat(file)
    const client = new S3Client({s3Options: {signatureVersion: "v4"}})
    const cancellationToken = this.context.cancellationToken

    const uploader = client.createFileUploader(file, (this.info.path == null ? "" : `${this.info.path}/`) + fileName, {
      Bucket: this.info.bucket!,
      ACL: this.info.acl || "public-read",
      StorageClass: this.info.storageClass || undefined
    })

    const progressBar = this.createProgressBar(fileName, fileStat)
    if (progressBar != null) {
      const callback = new ProgressCallback(progressBar)
      uploader.on("progress", () => {
        if (!cancellationToken.cancelled) {
          callback.update(uploader.progressAmount, uploader.progressTotal)
        }
      })
    }

    return cancellationToken.createPromise((resolve, reject, onCancel) => {
      onCancel(() => uploader.abort())
      uploader.upload()
        .then(() => {
          try {
            debug(`S3 Publisher: ${fileName} was uploaded to ${this.info.bucket}`)
          }
          finally {
            resolve()
          }
        })
        .catch(reject)
    })
  }

  toString() {
    return `S3 (bucket: ${this.info.bucket})`
  }
}