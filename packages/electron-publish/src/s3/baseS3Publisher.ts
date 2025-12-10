import { log } from "builder-util"
import { BaseS3Options } from "builder-util-runtime"
import { mkdir, symlink } from "fs/promises"
import * as path from "path"
<<<<<<< HEAD
<<<<<<< HEAD
import { PublishContext, UploadTask } from "../index.js"
import { Publisher } from "../publisher.js"
import type { AwsCredentials } from "./awsCredentials.js"
import { getS3ContentType, startS3PutObject } from "./s3UploadHelper.js"

export interface S3UploadConfig {
  region: string
  endpoint?: string
  forcePathStyle?: boolean
  credentials?: AwsCredentials
}

export interface S3UploadExtraParams {
  acl?: string
  storageClass?: string
  serverSideEncryption?: string
}
=======
import { PublishContext, UploadTask } from ".."
=======
import { PublishContext, UploadTask } from "../index.js"
>>>>>>> c92b22265 (tmp save for .js extension migration)
import { Publisher } from "../publisher.js"
>>>>>>> d26567f58 (tmp save)

export abstract class BaseS3Publisher extends Publisher {
  protected constructor(
    context: PublishContext,
    private readonly options: BaseS3Options
  ) {
    super(context)
  }

  protected abstract getBucketName(): string

  public abstract getS3UploadConfig(): S3UploadConfig

  public getUploadExtraParams(): S3UploadExtraParams {
    return {
      acl: this.options.acl !== null ? (this.options.acl ?? "public-read") : undefined,
    }
  }

  // http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/s3-example-creating-buckets.html
  async upload(task: UploadTask): Promise<any> {
    const fileName = path.basename(task.file)
    const cancellationToken = this.context.cancellationToken
    const key = (this.options.path == null ? "" : `${this.options.path}/`) + fileName

    if (process.env.__TEST_S3_PUBLISHER__ != null) {
      const testFile = path.join(process.env.__TEST_S3_PUBLISHER__, key)
      await mkdir(path.dirname(testFile), { recursive: true })
      await symlink(task.file, testFile)
      return
    }

    this.createProgressBar(fileName, -1)

    const config = this.getS3UploadConfig()
    const extraParams = this.getUploadExtraParams()

    return await cancellationToken.createPromise((resolve, reject, onCancel) => {
      const { req, done } = startS3PutObject({
        bucket: this.getBucketName(),
        key,
        file: task.file,
        contentType: getS3ContentType(task.file),
        ...config,
        ...extraParams,
      })

      onCancel(() => req.destroy())

      done
        .then(() => {
          try {
            log.debug({ provider: this.providerName, file: fileName, bucket: this.getBucketName() }, "uploaded")
          } finally {
            resolve(undefined)
          }
        })
        .catch(reject)
    })
  }

  toString() {
    return `${this.providerName} (bucket: ${this.getBucketName()})`
  }
}
