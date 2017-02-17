import { S3 } from "aws-sdk"
import { S3Options } from "electron-builder-http/out/publishOptions"
import { debug, isEmptyOrSpaces } from "electron-builder-util"
import { PublishContext, Publisher } from "electron-publish"
import { stat } from "fs-extra-p"
import mime from "mime"
import { basename } from "path"

export default class S3Publisher extends Publisher {
  private readonly s3 = new S3({signatureVersion: "v4"})

  readonly providerName = "S3"

  constructor(context: PublishContext, private readonly info: S3Options) {
    super(context)

    debug(`Creating S3 Publisher — bucket: ${info.bucket}`)

    if (isEmptyOrSpaces(process.env.AWS_ACCESS_KEY_ID)) {
      throw new Error(`Env AWS_ACCESS_KEY_ID is not set`)
    }
    if (isEmptyOrSpaces(process.env.AWS_SECRET_ACCESS_KEY)) {
      throw new Error(`Env AWS_SECRET_ACCESS_KEY is not set`)
    }
  }

  // http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/s3-example-creating-buckets.html
  async upload(file: string, safeArtifactName?: string): Promise<any> {
    const fileName = basename(file)
    const fileStat = await stat(file)
    return this.context.cancellationToken.createPromise((resolve, reject, onCancel) => {
      const upload = this.s3.upload({
        Bucket: this.info.bucket!,
        Key: (this.info.path == null ? "" : `${this.info.path}/`) + fileName,
        ACL: this.info.acl || "public-read",
        Body: this.createReadStreamAndProgressBar(file, fileStat, this.createProgressBar(fileName, fileStat), reject),
        ContentLength: fileStat.size,
        ContentType: mime.lookup(fileName),
        StorageClass: this.info.storageClass || undefined
      }, (error: Error, data: any) => {
        if (error != null) {
          reject(error)
          return
        }

        debug(`S3 Publisher: ${fileName} was uploaded to ${data.Location}`)
        resolve()
      })

      onCancel(() => upload.abort())
    })
  }

  toString() {
    return `S3 (bucket: ${this.info.bucket})`
  }
}
