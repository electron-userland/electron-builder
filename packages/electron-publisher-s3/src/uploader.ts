import { config as awsConfig, S3 } from "aws-sdk"
import BluebirdPromise from "bluebird-lst"
import { EventEmitter } from "events"
import { createReadStream, fstat, open } from "fs-extra-p"
import mime from "mime"
import { FdSlicer, SlicedReadStream } from "./fdSlicer"

const MultipartETag = require("../s3-client/multipart_etag")

const MAX_PUT_OBJECT_SIZE = 5 * 1024 * 1024 * 1024
const MAX_MULTIPART_COUNT = 10000
const MIN_MULTIPART_SIZE = 5 * 1024 * 1024

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
    this.multipartUploadSize = options.multipartUploadSize || (15 * 1024 * 1024)
    this.multipartDownloadThreshold = options.multipartDownloadThreshold || (20 * 1024 * 1024)
    this.multipartDownloadSize = options.multipartDownloadSize || (15 * 1024 * 1024)

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
    return new Uploader(this, Object.assign({Key: encodeSpecialCharacters(target)}, s3Options), localFile)
  }
}

export class Uploader extends EventEmitter {
  /** @readonly */
  progressAmount = 0
  /** @readonly */
  progressTotal = 0

  private cancelled = false

  private fileSlicer: FdSlicer | null
  private fileStat: any

  private readonly parts: Array<any> = []

  private slicerError: Error | null

  constructor(private readonly client: S3Client, private readonly s3Options: any, private readonly localFile: string) {
    super()
  }

  private async openFile() {
    const fd = await open(this.localFile, "r")
    this.fileStat = await fstat(fd)
    this.progressTotal = this.fileStat.size

    this.fileSlicer = new FdSlicer(fd)
    const localFileSlicer = this.fileSlicer
    localFileSlicer.on("error", (error: Error) => {
      this.cancelled = true
      this.slicerError = error
    })
    localFileSlicer.on("close", () => {
      this.emit("fileClosed")
    })

    this.emit("fileOpened", localFileSlicer)
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
    await this.openFile()

    const client = this.client
    if (this.fileStat.size >= client.multipartUploadThreshold) {
      let multipartUploadSize = client.multipartUploadSize
      const partsRequiredCount = Math.ceil(this.fileStat.size / multipartUploadSize)
      if (partsRequiredCount > MAX_MULTIPART_COUNT) {
        multipartUploadSize = smallestPartSizeFromFileSize(this.fileStat.size)
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
    const multipartETag = new MultipartETag({size: this.fileStat.size, count: 1})
    const multipartPromise = new BluebirdPromise((resolve, reject) => {
      multipartETag.on("end", resolve)

      const inStream = createReadStream(this.localFile, {fd: this.fileSlicer!.fd, autoClose: false})
      inStream.on("error", reject)
      inStream.pipe(multipartETag)
    })
      .then(() => {
        this.progressAmount = multipartETag.bytes
        this.progressTotal = multipartETag.bytes
        this.fileStat.size = multipartETag.bytes
        this.fileStat.multipartETag = multipartETag
        this.emit("progress")
      })

    multipartETag.on("progress", () => {
      if (!this.cancelled) {
        this.progressAmount = multipartETag.bytes
        this.emit("progress")
      }
    })

    this.progressAmount = 0
    const data = (await BluebirdPromise.all([multipartPromise, this.client.s3.putObject(Object.assign({
      ContentType: mime.lookup(this.localFile),
      ContentLength: this.fileStat.size,
      Body: multipartETag,
    }, this.s3Options)).promise()]))[1]

    if (!compareMultipartETag(data.ETag, this.fileStat.multipartETag)) {
      throw new Error("ETag does not match MD5 checksum")
    }
  }

  private async multipartUpload(uploadId: string, multipartUploadSize: number): Promise<any> {
    let cursor = 0
    let nextPartNumber = 1

    const parts: Array<Part> = []
    while (cursor < this.fileStat.size) {
      const start = cursor
      let end = cursor + multipartUploadSize
      if (end > this.fileStat.size) {
        end = this.fileStat.size
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

      const multipartETag = new MultipartETag({size: contentLength, count: 1})
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

function encodeSpecialCharacters(filename: string) {
  // Note: these characters are valid in URIs, but S3 does not like them for
  // some reason.
  return encodeURI(filename).replace(/[!'()* ]/g, char => `%${char.charCodeAt(0).toString(16)}`)
}

function smallestPartSizeFromFileSize(fileSize: number) {
  const partSize = Math.ceil(fileSize / MAX_MULTIPART_COUNT)
  return partSize < MIN_MULTIPART_SIZE ? MIN_MULTIPART_SIZE : partSize
}