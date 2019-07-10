import { Arch, log } from "builder-util"
import { CancellationToken, ProgressCallbackTransform } from "builder-util-runtime"
import { PADDING } from "builder-util/out/log"
import chalk from "chalk"
import { createReadStream, stat, Stats } from "fs-extra"
import { ClientRequest } from "http"
import { basename } from "path"
import { MultiProgress } from "./multiProgress"
import { ProgressBar } from "./progress"

export type PublishPolicy = "onTag" | "onTagOrDraft" | "always" | "never"

export { ProgressCallback } from "./progress"

export interface PublishOptions {
  publish?: PublishPolicy | null
}

export interface PublishContext {
  readonly cancellationToken: CancellationToken
  readonly progress: MultiProgress | null
}

const progressBarOptions = {
  incomplete: " ",
  width: 20,
}

export interface UploadTask {
  file: string
  fileContent?: Buffer | null

  arch: Arch | null
  safeArtifactName?: string | null
}

export abstract class Publisher {
  protected constructor(protected readonly context: PublishContext) {
  }

  abstract get providerName(): string

  abstract upload(task: UploadTask): Promise<any>

  protected createProgressBar(fileName: string, size: number): ProgressBar | null {
    log.info({file: fileName, provider: this.providerName}, "uploading")
    if (this.context.progress == null || size < (512 * 1024)) {
      return null
    }
    return this.context.progress.createBar(`${" ".repeat(PADDING + 2)}[:bar] :percent :etas | ${chalk.green(fileName)} to ${this.providerName}`, {total: size, ...progressBarOptions})
  }

  protected createReadStreamAndProgressBar(file: string, fileStat: Stats, progressBar: ProgressBar | null, reject: (error: Error) => void): NodeJS.ReadableStream {
    const fileInputStream = createReadStream(file)
    fileInputStream.on("error", reject)

    if (progressBar == null) {
      return fileInputStream
    }
    else {
      const progressStream = new ProgressCallbackTransform(fileStat.size, this.context.cancellationToken, it => progressBar.tick(it.delta))
      progressStream.on("error", reject)
      return fileInputStream.pipe(progressStream)
    }
  }

  abstract toString(): string
}

export abstract class HttpPublisher extends Publisher {
  protected constructor(protected readonly context: PublishContext, private readonly useSafeArtifactName = false) {
    super(context)
  }

  async upload(task: UploadTask): Promise<any> {
    const fileName = (this.useSafeArtifactName ? task.safeArtifactName : null) || basename(task.file)

    if (task.fileContent != null) {
      await this.doUpload(fileName, task.arch || Arch.x64, task.fileContent.length, it => it.end(task.fileContent))
      return
    }

    const fileStat = await stat(task.file)

    const progressBar = this.createProgressBar(fileName, fileStat.size)
    await this.doUpload(fileName, task.arch || Arch.x64, fileStat.size, (request, reject) => {
      if (progressBar != null) {
        // reset (because can be called several times (several attempts)
        progressBar.update(0)
      }
      return this.createReadStreamAndProgressBar(task.file, fileStat, progressBar, reject).pipe(request)
    }, task.file)
  }

  protected abstract doUpload(fileName: string, arch: Arch, dataLength: number, requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void, file?: string): Promise<any>
}

export function getCiTag() {
  const tag = process.env.TRAVIS_TAG || process.env.APPVEYOR_REPO_TAG_NAME || process.env.CIRCLE_TAG || process.env.BITRISE_GIT_TAG || process.env.CI_BUILD_TAG
  return tag != null && tag.length > 0 ? tag : null
}