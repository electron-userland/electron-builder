import { config as awsConfig, S3 } from "aws-sdk"
import BluebirdPromise from "bluebird-lst"
import { createHash } from "crypto"
import { EventEmitter } from "events"
import { createReadStream, open, stat } from "fs-extra-p"
import mime from "mime"
import { FdSlicer, SlicedReadStream } from "./fdSlicer"
import { MultipartETag } from "./multipartEtag"

const MAX_PUT_OBJECT_SIZE = 5 * 1024 * 1024 * 1024
const MAX_MULTIPART_COUNT = 10000
const MIN_MULTIPART_SIZE = 5 * 1024 * 1024
const commonUploadSize = 15 * 1024 * 1024

awsConfig.setPromisesDependency(require("bluebird-lst"))

export class S3Client {
  readonly s3: S3
  readonly s3RetryCount: number
  readonly s3RetryDelay: number
  readonly multipartUploadThreshold: number
  readonly multipartUploadSize: number
  readonly multipartDownloadThreshold: number
  readonly multipartDownloadSize: number

  constructor(options: any = {}) {
    this.s3 = options.s3Client || new S3(options.s3Options)
    this.s3RetryCount = options.s3RetryCount || 3
    this.s3RetryDelay = options.s3RetryDelay || 1000

    this.multipartUploadThreshold = options.multipartUploadThreshold || (20 * 1024 * 1024)
    this.multipartUploadSize = options.multipartUploadSize || commonUploadSize
    this.multipartDownloadThreshold = options.multipartDownloadThreshold || (20 * 1024 * 1024)
    this.multipartDownloadSize = options.multipartDownloadSize || commonUploadSize

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

  createFileUploader(localFile: string, target: string, s3Options: any) {
    return new Uploader(this, Object.assign({Key: target}, s3Options), localFile)
  }
}

export class Uploader extends EventEmitter {
  /** @readonly */
  progressAmount = 0
  /** @readonly */
  progressTotal = 0

  private cancelled = false

  private fileSlicer: FdSlicer | null

  private readonly parts: Array<any> = []

  private slicerError: Error | null
  private contentLength: number

  constructor(private readonly client: S3Client, private readonly s3Options: any, private readonly localFile: string) {
    super()
  }

  private async openFile() {
    this.progressTotal = this.contentLength
    this.fileSlicer = new FdSlicer(await open(this.localFile, "r"))
    this.fileSlicer.on("error", (error: Error) => {
      this.cancelled = true
      this.slicerError = error
    })
  }

  private async closeFile() {
    this.cancelled = true
    if (this.fileSlicer != null) {
      this.fileSlicer.close()
      this.fileSlicer = null
    }
  }

  upload() {
    return (<BluebirdPromise<any>>this._upload())
      .then(async it => {
        if (this.slicerError != null) {
          throw this.slicerError
        }
        await this.closeFile()
        return it
      })
      .catch(async error => {
        try {
          await this.closeFile()
        }
        catch (ignored) {
        }
        throw error
      })
  }

  private async _upload() {
    const client = this.client

    this.contentLength = (await stat(this.localFile)).size
    this.progressTotal = this.contentLength

    if (this.contentLength >= client.multipartUploadThreshold) {
      await this.openFile()
      let multipartUploadSize = client.multipartUploadSize
      const partsRequiredCount = Math.ceil(this.contentLength / multipartUploadSize)
      if (partsRequiredCount > MAX_MULTIPART_COUNT) {
        multipartUploadSize = smallestPartSizeFromFileSize(this.contentLength)
      }

      if (multipartUploadSize > MAX_PUT_OBJECT_SIZE) {
        throw new Error(`File size exceeds maximum object size: ${this.localFile}`)
      }

      const data = await this.runOrRetry(() => client.s3.createMultipartUpload(Object.assign({ContentType: mime.lookup(this.localFile)}, this.s3Options)).promise())
      await this.multipartUpload(data.UploadId!, multipartUploadSize)
    }
    else {
      await this.runOrRetry(this.putObject.bind(this))
    }
  }

  abort() {
    this.cancelled = true
  }

  private async putObject() {
    this.progressAmount = 0

    const md5 = await hashFile(this.localFile, "md5", "base64")

    await new BluebirdPromise<any>((resolve, reject) => {
      const inStream = createReadStream(this.localFile)
      inStream.on("error", reject)

      this.client.s3.putObject(Object.assign({
        ContentType: mime.lookup(this.localFile),
        ContentLength: this.contentLength,
        Body: inStream,
        ContentMD5: md5,
      }, this.s3Options))
        .on("httpUploadProgress", progress => {
          this.progressAmount = progress.loaded
          this.progressTotal = progress.total
          if (!this.cancelled) {
            this.emit("progress")
          }
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

    const parts: Array<Part> = []
    while (cursor < this.contentLength) {
      const start = cursor
      let end = cursor + multipartUploadSize
      if (end > this.contentLength) {
        end = this.contentLength
      }
      cursor = end
      const part = {
        ETag: null,
        PartNumber: nextPartNumber++,
      }
      this.parts.push(part)
      parts.push({start, end, part})
    }

    await BluebirdPromise.map(parts, it => this.makeUploadPart(it, uploadId), {concurrency: 4})
    return await this.runOrRetry(() => this.client.s3.completeMultipartUpload({
        Bucket: this.s3Options.Bucket,
        Key: this.s3Options.Key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: this.parts,
        },
      }).promise()
    )
  }

  private makeUploadPart(p: Part, uploadId: string): Promise<any> {
    return this.runOrRetry(async () => {
      const client = this.client
      let errorOccurred = false

      const contentLength = p.end - p.start

      const multipartETag = new MultipartETag()
      let prevBytes = 0
      let overallDelta = 0
      multipartETag.on("progress", () => {
        if (this.cancelled || errorOccurred) {
          return
        }

        const delta = multipartETag.bytes - prevBytes
        prevBytes = multipartETag.bytes
        this.progressAmount += delta
        overallDelta += delta
        this.emit("progress")
      })

      const inStream = new SlicedReadStream(this.fileSlicer!, p.start, p.end)
      const multipartPromise = new BluebirdPromise((resolve, reject) => {
        inStream.on("error", reject)
        multipartETag.on("end", resolve)
      })
        .then(() => {
          if (this.cancelled || errorOccurred) {
            return
          }

          this.progressAmount += multipartETag.bytes - prevBytes
          this.progressTotal += (p.end - p.start) - multipartETag.bytes
          this.emit("progress")
        })

      inStream.pipe(multipartETag)

      const data = (await BluebirdPromise.all([multipartPromise, client.s3.uploadPart({
        ContentLength: contentLength,
        PartNumber: p.part.PartNumber,
        UploadId: uploadId,
        Body: multipartETag,
        Bucket: this.s3Options.Bucket,
        Key: this.s3Options.Key,
      }).promise()
        .catch(error => {
          errorOccurred = true
          this.progressAmount -= overallDelta
          throw error
        })]))[1]

      if (!compareMultipartETag(data.ETag, multipartETag)) {
        this.progressAmount -= overallDelta
        throw new Error("ETag does not match MD5 checksum")
      }
      p.part.ETag = data.ETag
      return data
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
            if (++attemptNumber >= this.client.s3RetryCount) {
              reject(error)
            }
            else if (this.cancelled) {
              reject(new Error("cancelled"))
            }
            else {
              setTimeout(tryRun, this.client.s3RetryDelay)
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
}

function cleanETag(eTag: string | null | undefined) {
  return eTag == null ? "" : eTag.replace(/^\s*'?\s*"?\s*(.*?)\s*"?\s*'?\s*$/, "$1")
}

function compareMultipartETag(eTag: string | null | undefined, multipartETag: any) {
  return multipartETag.anyMatch(cleanETag(eTag))
}

function smallestPartSizeFromFileSize(fileSize: number) {
  const partSize = Math.ceil(fileSize / MAX_MULTIPART_COUNT)
  return partSize < MIN_MULTIPART_SIZE ? MIN_MULTIPART_SIZE : partSize
}

function hashFile(file: string, algorithm: string, encoding: string = "hex") {
  return new BluebirdPromise<string>((resolve, reject) => {
    const hash = createHash(algorithm)
    hash
      .on("error", reject)
      .setEncoding(encoding)

    createReadStream(file)
      .on("error", reject)
      .on("end", () => {
        hash.end()
        resolve(<string>hash.read())
      })
      .pipe(hash, {end: false})
  })
}