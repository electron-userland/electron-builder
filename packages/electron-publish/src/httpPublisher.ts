import { Arch } from "builder-util"
import { stat } from "fs-extra"
import { ClientRequest } from "http"
import { basename } from "path"
import { PublishContext, UploadTask } from "./index.js"
import { Publisher } from "./publisher.js"

export abstract class HttpPublisher extends Publisher {
  protected constructor(
    protected readonly context: PublishContext,
    private readonly useSafeArtifactName = false
  ) {
    super(context)
  }

  async upload(task: UploadTask): Promise<any> {
    const fileName = (this.useSafeArtifactName ? task.safeArtifactName : null) || basename(task.file)

    if (task.fileContent != null) {
      await this.doUpload(
        fileName,
        task.arch || Arch.x64,
        task.fileContent.length,
        (request, reject) => {
          if (task.timeout) {
            request.setTimeout(task.timeout, () => {
              request.destroy()
              reject(new Error("Request timed out"))
            })
          }
          return request.end(task.fileContent)
        },
        task.file
      )
      return
    }

    const fileStat = await stat(task.file)

    const progressBar = this.createProgressBar(fileName, fileStat.size)
    return this.doUpload(
      fileName,
      task.arch || Arch.x64,
      fileStat.size,
      (request, reject) => {
        if (progressBar != null) {
          // reset (because can be called several times (several attempts)
          progressBar.update(0)
        }
        if (task.timeout) {
          request.setTimeout(task.timeout, () => {
            request.destroy()
            reject(new Error("Request timed out"))
          })
        }
        return this.createReadStreamAndProgressBar(task.file, fileStat, progressBar, reject).pipe(request)
      },
      task.file
    )
  }

  protected abstract doUpload(
    fileName: string,
    arch: Arch,
    dataLength: number,
    requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void,
    file: string
  ): Promise<any>
}
