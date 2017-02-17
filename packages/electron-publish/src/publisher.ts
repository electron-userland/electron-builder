import { green } from "chalk"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"
import { ProgressCallbackTransform } from "electron-builder-http/out/ProgressCallbackTransform"
import { log } from "electron-builder-util/out/log"
import { createReadStream, stat, Stats } from "fs-extra-p"
import { ClientRequest } from "http"
import { basename } from "path"
import ProgressBar from "progress-ex"
import { MultiProgress } from "./multiProgress"

export type PublishPolicy = "onTag" | "onTagOrDraft" | "always" | "never"

export interface PublishOptions {
  publish?: PublishPolicy | null

  draft?: boolean
  prerelease?: boolean
}

export interface PublishContext {
  readonly cancellationToken: CancellationToken
  readonly progress: MultiProgress | null
}

const progressBarOptions = {
  incomplete: " ",
  width: 20,
}

export abstract class Publisher {
  constructor(protected readonly context: PublishContext) {
  }

  abstract get providerName(): string

  abstract upload(file: string, safeArtifactName?: string): Promise<any>

  protected createProgressBar(fileName: string, fileStat: Stats): ProgressBar | null {
    if (this.context.progress == null) {
      log(`Uploading ${fileName} to ${this.providerName}`)
      return null
    }
    else {
      return this.context.progress.createBar(`[:bar] :percent :etas | ${green(fileName)} to ${this.providerName}`, Object.assign({total: fileStat.size}, progressBarOptions))
    }
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
  constructor(protected readonly context: PublishContext, private readonly useSafeArtifactName = false) {
    super(context)
  }

  async upload(file: string, safeArtifactName?: string): Promise<any> {
    const fileName = (this.useSafeArtifactName ? safeArtifactName : null) || basename(file)
    const fileStat = await stat(file)

    const progressBar = this.createProgressBar(fileName, fileStat)
    await this.doUpload(fileName, fileStat.size, (request, reject) => {
      if (progressBar != null) {
        // reset (because can be called several times (several attempts)
        progressBar.update(0)
      }
      return this.createReadStreamAndProgressBar(file, fileStat, progressBar, reject).pipe(request)
    }, file)
  }

  uploadData(data: Buffer, fileName: string): Promise<any> {
    if (data == null || fileName == null) {
      throw new Error("data or fileName is null")
    }
    return this.doUpload(fileName, data.length, it => it.end(data))
  }

  protected abstract doUpload(fileName: string, dataLength: number, requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void, file?: string): Promise<any>
}