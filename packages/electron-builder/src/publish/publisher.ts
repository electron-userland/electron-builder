import { ClientRequest } from "http"
import { uploadFile } from "./uploader"
import { stat } from "fs-extra-p"
import { basename } from "path"

export type PublishPolicy = "onTag" | "onTagOrDraft" | "always" | "never"

export interface PublishOptions {
  publish?: PublishPolicy | null

  draft?: boolean
  prerelease?: boolean
}

export abstract class Publisher {
  async upload(file: string, artifactName?: string): Promise<any> {
    const fileName = artifactName || basename(file)
    const fileStat = await stat(file)
    await this.doUpload(fileName, fileStat.size, uploadFile.bind(this, file, fileStat, fileName))
  }

  uploadData(data: Buffer, fileName: string): Promise<any> {
    if (data == null || fileName == null) {
      throw new Error("data or fileName is null")
    }
    return this.doUpload(fileName, data.length, it => it.end(data))
  }

  protected abstract doUpload(fileName: string, dataLength: number, requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void): Promise<any>
}