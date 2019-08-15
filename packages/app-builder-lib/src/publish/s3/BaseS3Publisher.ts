import { log, executeAppBuilder } from "builder-util"
import { BaseS3Options } from "builder-util-runtime"
import { PublishContext, Publisher, UploadTask } from "electron-publish"
import { ensureDir, symlink } from "fs-extra"
import * as path from "path"

export abstract class BaseS3Publisher extends Publisher {
  protected constructor(context: PublishContext, private options: BaseS3Options) {
    super(context)
  }

  protected abstract getBucketName(): string

  protected configureS3Options(args: Array<string>) {
    // if explicitly set to null, do not add
    if (this.options.acl !== null) {
      args.push("--acl", this.options.acl || "public-read")
    }
  }

  // http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/s3-example-creating-buckets.html
  async upload(task: UploadTask): Promise<any> {
    const fileName = path.basename(task.file)
    const cancellationToken = this.context.cancellationToken

    const target = (this.options.path == null ? "" : `${this.options.path}/`) + fileName

    const args = ["publish-s3", "--bucket", this.getBucketName(), "--key", target, "--file", task.file]
    this.configureS3Options(args)

    if (process.env.__TEST_S3_PUBLISHER__ != null) {
      const testFile = path.join(process.env.__TEST_S3_PUBLISHER__!, target)
      await ensureDir(path.dirname(testFile))
      await symlink(task.file, testFile)
      return
    }

    // https://github.com/aws/aws-sdk-go/issues/279
    this.createProgressBar(fileName, -1)
    // if (progressBar != null) {
    //   const callback = new ProgressCallback(progressBar)
    //   uploader.on("progress", () => {
    //     if (!cancellationToken.cancelled) {
    //       callback.update(uploader.loaded, uploader.contentLength)
    //     }
    //   })
    // }

    return await cancellationToken.createPromise((resolve, reject, onCancel) => {
      executeAppBuilder(args, process => {
        onCancel(() => {
          process.kill("SIGINT")
        })
      })
        .then(() => {
          try {
            log.debug({provider: this.providerName, file: fileName, bucket: this.getBucketName()}, "uploaded")
          }
          finally {
            resolve()
          }
        })
        .catch(reject)
    })
  }

  toString() {
    return `${this.providerName} (bucket: ${this.getBucketName()})`
  }
}
