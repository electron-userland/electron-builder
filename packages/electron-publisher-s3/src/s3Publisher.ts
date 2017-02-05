import { Publisher } from "electron-builder-publisher"
import { S3Options } from "electron-builder-http/out/publishOptions"
import { ClientRequest } from "http"
import { S3 } from "aws-sdk"
import { createReadStream } from "fs-extra-p"
import mime from "mime"
import BluebirdPromise from "bluebird-lst-c"
import { debug, isEmptyOrSpaces } from "electron-builder-util"

export default class S3Publisher extends Publisher {
  private readonly s3 = new S3({signatureVersion: "v4"})

  constructor(private readonly info: S3Options) {
    super()

    debug(`Creating S3 Publisher — bucket: ${info.bucket}`)

    if (isEmptyOrSpaces(process.env.AWS_ACCESS_KEY_ID)) {
      throw new Error(`Env AWS_ACCESS_KEY_ID is not set`)
    }
    if (isEmptyOrSpaces(process.env.AWS_SECRET_ACCESS_KEY)) {
      throw new Error(`Env AWS_SECRET_ACCESS_KEY is not set`)
    }
  }

  // http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/s3-example-creating-buckets.html
  protected async doUpload(fileName: string, dataLength: number, requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void, file: string): Promise<any> {
    debug(`S3 Publisher: uploading ${fileName} to ${this.info.bucket}`)

    return new BluebirdPromise((resolve, reject) => {
      //noinspection JSUnusedLocalSymbols
      const fileStream = createReadStream(file)
      fileStream.on("error", reject)

      this.s3.upload({
        Bucket: this.info.bucket!,
        Key: fileName,
        ACL: this.info.acl || "public-read",
        Body: fileStream,
        ContentLength: <any>dataLength,
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
    })
  }
}
