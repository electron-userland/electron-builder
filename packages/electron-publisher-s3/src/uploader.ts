import { config as awsConfig, S3 } from "aws-sdk"
import { CreateMultipartUploadRequest } from "aws-sdk/clients/s3"
import BluebirdPromise from "bluebird-lst"
import { hashFile } from "builder-util"
import { EventEmitter } from "events"
import { createReadStream } from "fs-extra-p"
import { cpus } from "os"
import { createHash } from "crypto"

const MAX_PUT_OBJECT_SIZE = 5 * 1024 * 1024 * 1024
const MAX_MULTIPART_COUNT = 10000
const MIN_MULTIPART_SIZE = 5 * 1024 * 1024
const commonUploadSize = 15 * 1024 * 1024

awsConfig.setPromisesDependency(require("bluebird-lst"))

export class Uploader extends EventEmitter {
  /** @readonly */
  loaded = 0

  private cancelled = false

  readonly s3RetryCount: number
  readonly s3RetryDelay: number
  readonly multipartUploadThreshold: number
  readonly multipartUploadSize: number
  readonly multipartDownloadThreshold: number
  readonly multipartDownloadSize: number

  constructor(private readonly s3: S3, private readonly s3Options: CreateMultipartUploadRequest, private readonly localFile: string, readonly contentLength: number, private readonly fileContent: Buffer | null | undefined) {
    super()

    this.s3RetryCount = 3
    this.s3RetryDelay = 1000

    this.multipartUploadThreshold = (20 * 1024 * 1024)
    this.multipartUploadSize = commonUploadSize
    this.multipartDownloadThreshold = (20 * 1024 * 1024)
    this.multipartDownloadSize = commonUploadSize

    if (this.multipartUploadThreshold < MIN_MULTIPART_SIZE) {
      throw new Error("Minimum multipartUploadThreshold is 5MB.")
    }
    if (this.multipartUploadThreshold > MAX_PUT_OBJECT_SIZE) {
      throw new Error("Maximum multipartUploadThreshold is 5GB.")
    }
    if (this.multipartUploadSize < MIN_MULTIPART_SIZE) {
      throw new Error("Minimum multipartUploadSize is 5MB.")
    }
    if (this.multipartUploadSize > MAX_PUT_OBJECT_SIZE) {
      throw new Error("Maximum multipartUploadSize is 5GB.")
    }
  }

  async upload() {
    const fileContent = this.fileContent
    if (fileContent != null) {
      const hash = createHash("md5")
      hash.update(fileContent)
      const md5 = hash.digest("base64")
      await this.runOrRetry(() => this.putObject(md5))
      return
    }

    if (this.contentLength < this.multipartUploadThreshold) {
      const md5 = await hashFile(this.localFile, "md5")
      await this.runOrRetry(() => this.putObject(md5))
      return
    }

    let multipartUploadSize = this.multipartUploadSize
    if (Math.ceil(this.contentLength / multipartUploadSize) > MAX_MULTIPART_COUNT) {
      multipartUploadSize = smallestPartSizeFromFileSize(this.contentLength)
    }

    if (multipartUploadSize > MAX_PUT_OBJECT_SIZE) {
      throw new Error(`File size exceeds maximum object size: ${this.localFile}`)
    }

    const data = await this.runOrRetry(() => this.s3.createMultipartUpload(this.s3Options).promise())
    await this.multipartUpload(data.UploadId!, multipartUploadSize)
  }

  abort() {
    this.cancelled = true
  }

  private putObject(md5: string) {
    this.loaded = 0
    return new BluebirdPromise<any>((resolve, reject) => {
      this.s3.putObject({
        Body: this.fileContent || createReadStream(this.localFile),
        ContentMD5: md5,
        ...this.s3Options,
      })
        .on("httpUploadProgress", progress => {
          this.loaded = progress.loaded
          this.emit("progress")
        })
        .send((error, data) => {
          if (error == null) {
            resolve(data)
          }
          else {
            reject(error)
          }
        })
    })
  }

  private async multipartUpload(uploadId: string, multipartUploadSize: number): Promise<any> {
    let cursor = 0
    let nextPartNumber = 1

    const partsA: Array<any> = []

    const parts: Array<Part> = []
    while (cursor < this.contentLength) {
      const start = cursor
      let end = cursor + multipartUploadSize
      if (end > this.contentLength) {
        end = this.contentLength
      }
      cursor = end
      const part = {
        PartNumber: nextPartNumber++,
      }
      partsA.push(part)
      parts.push({start, end, part, md5: ""})
    }

    await BluebirdPromise.map(parts, async it => {
      // hashFile - both start and end are inclusive
      it.md5 = await hashFile(this.localFile, "md5", "base64", {start: it.start, end: it.end - 1})
    }, {concurrency: cpus().length})

    await BluebirdPromise.map(parts, it => this.makeUploadPart(it, uploadId), {concurrency: 4})
    return await this.runOrRetry(() => this.s3.completeMultipartUpload({
        Bucket: this.s3Options.Bucket,
        Key: this.s3Options.Key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: partsA,
        },
      }).promise()
    )
  }

  private makeUploadPart(part: Part, uploadId: string): Promise<any> {
    const contentLength = part.end - part.start
    return this.runOrRetry(() => {
      let partLoaded = 0
      return new BluebirdPromise((resolve, reject) => {
        this.s3.uploadPart({
          ContentLength: contentLength,
          PartNumber: part.part.PartNumber,
          UploadId: uploadId,
          Body: createReadStream(this.localFile, {start: part.start, end: part.end - 1}),
          Bucket: this.s3Options.Bucket,
          Key: this.s3Options.Key,
          ContentMD5: part.md5,
        })
          .on("httpUploadProgress", progress => {
            partLoaded = progress.loaded
            this.loaded += progress.loaded
            this.emit("progress")
          })
          .send((error, data) => {
            if (error == null) {
              part.part.ETag = data.ETag
              resolve(data)
            }
            else {
              this.loaded -= partLoaded
              reject(error)
            }
          })
      })
    })
  }

  private async runOrRetry<T>(task: () => Promise<T>): Promise<T> {
    return new BluebirdPromise<T>((resolve, reject) => {
      let attemptNumber = 0
      const tryRun = () => {
        if (this.cancelled) {
          return
        }

        task()
          .then(resolve)
          .catch(error => {
            if (++attemptNumber >= this.s3RetryCount) {
              reject(error)
            }
            else if (this.cancelled) {
              reject(new Error("cancelled"))
            }
            else {
              setTimeout(tryRun, this.s3RetryDelay)
            }
          })
      }

      tryRun()
    })
  }
}

interface Part {
  start: number
  end: number
  part: any
  md5: string
}

function smallestPartSizeFromFileSize(fileSize: number) {
  const partSize = Math.ceil(fileSize / MAX_MULTIPART_COUNT)
  return partSize < MIN_MULTIPART_SIZE ? MIN_MULTIPART_SIZE : partSize
}