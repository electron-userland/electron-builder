import { isEmptyOrSpaces } from "electron-builder-util"
import { log } from "electron-builder-util/out/log"
// import { parse as parseUrl } from "url"
// import BluebirdPromise from "bluebird-lst-c"
import { Publisher } from "./publisher"
import { S3Options } from "electron-builder-http/out/publishOptions"
import { ClientRequest } from "http"
let S3Client = require("s3").Client

export class S3Publisher extends Publisher {
  private token: string
  private secret: string
  private bucket: string
  private acl: string

  private s3client: any

  constructor(info: S3Options) {
    super()

    let token = info.token
    if (isEmptyOrSpaces(token)) {
      token = process.env.S3_TOKEN
      if (isEmptyOrSpaces(token)) {
        throw new Error(`S3 Access Key is not set, neither programmatically, nor using env "S3_TOKEN"`)
      }
    }

    let secret = info.secret
    if (isEmptyOrSpaces(secret)) {
      secret = process.env.S3_SECRET
      if (isEmptyOrSpaces(secret)) {
        throw new Error(`S3 Secret Access Key is not set, neither programmatically, nor using env "S3_SECRET"`)
      }
    }

    this.token = token!
    this.secret = secret!
    this.bucket = info.bucket!
    this.acl = info.acl || "public-read"

    this.s3client = new S3Client({
      s3Options: {
        accessKeyId: this.token,
        secretAccessKey: this.secret,
        region: info.region || "us-east-1"
      }
    })
  }

  protected async doUpload(fileName: string, dataLength: number, requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void, file: string): Promise<void> {
    for (let i = 0; i < 3; i++) {
      try {
        return await new Promise<void>((resolve, reject) => {
          const uploader = this.s3client.uploadFile({
            localFile: file.replace(process.cwd() + "/", ""),
            s3Params: {
              Bucket: this.bucket,
              Key: fileName,
              ACL: this.acl
            }
          })
          uploader.on("error", reject)
          uploader.on("end", resolve)
        })
      }
      catch (e) {
        log(`Artifacts will be not published`)

        throw e
      }
    }
  }
}
