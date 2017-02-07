import { ClientRequest } from "http"
import { stat, Stats, createReadStream } from "fs-extra-p"
import { basename } from "path"
import ProgressBar from "progress-ex"
import { ProgressCallbackTransform } from "electron-builder-http/out/ProgressCallbackTransform"
import { MultiProgress } from "./multiProgress"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"
import { green } from "chalk"
import { log } from "electron-builder-util/out/log"

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

  abstract upload(file: string, artifactName?: string): Promise<any>

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
  constructor(protected readonly context: PublishContext) {
    super(context)
  }

  async upload(file: string, artifactName?: string): Promise<any> {
    const fileName = artifactName || basename(file)
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