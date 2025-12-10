import { log, PADDING } from "builder-util"
import { ProgressCallbackTransform, PublishProvider } from "builder-util-runtime"
import * as chalk from "chalk"
import { createReadStream, Stats } from "fs-extra"
import { PublishContext, UploadTask } from "./index.js"
import { ProgressBar } from "./progress.js"

const progressBarOptions = {
  incomplete: " ",
  width: 20,
}

export abstract class Publisher {
  protected constructor(protected readonly context: PublishContext) {}

  abstract get providerName(): PublishProvider

  abstract upload(task: UploadTask): Promise<any>

  protected createProgressBar(fileName: string, size: number): ProgressBar | null {
    log.info({ file: fileName, provider: this.providerName }, "uploading")
    if (this.context.progress == null || size < 512 * 1024) {
      return null
    }
    return this.context.progress.createBar(`${" ".repeat(PADDING + 2)}[:bar] :percent :etas | ${chalk.green(fileName)} to ${this.providerName}`, {
      total: size,
      ...progressBarOptions,
    })
  }

  protected createReadStreamAndProgressBar(file: string, fileStat: Stats, progressBar: ProgressBar | null, reject: (error: Error) => void): NodeJS.ReadableStream {
    const fileInputStream = createReadStream(file)
    fileInputStream.on("error", reject)

    if (progressBar == null) {
      return fileInputStream
    } else {
      const progressStream = new ProgressCallbackTransform(fileStat.size, this.context.cancellationToken, it => progressBar.tick(it.delta))
      progressStream.on("error", reject)
      return fileInputStream.pipe(progressStream)
    }
  }

  abstract toString(): string
}

export function getCiTag() {
  const tag =
    process.env.TRAVIS_TAG ||
    process.env.APPVEYOR_REPO_TAG_NAME ||
    process.env.CIRCLE_TAG ||
    process.env.BITRISE_GIT_TAG ||
    process.env.CI_BUILD_TAG || // deprecated, GitLab uses `CI_COMMIT_TAG` instead
    process.env.CI_COMMIT_TAG ||
    process.env.BITBUCKET_TAG ||
    (process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : null)
  return tag != null && tag.length > 0 ? tag : null
}
