import ProgressBar from "progress"
import { createReadStream, Stats } from "fs-extra-p"
import { ReadStream } from "tty"
import { ClientRequest } from "http"
import { ProgressCallbackTransform } from "electron-builder-http/out/ProgressCallbackTransform"

export function uploadFile(file: string, fileStat: Stats, fileName: string, request: ClientRequest, reject: (error: Error) => void) {
  const progressBar = (<ReadStream>process.stdin).isTTY ? new ProgressBar(`Uploading ${fileName} [:bar] :percent :etas`, {
    total: fileStat.size,
    incomplete: " ",
    stream: process.stdout,
    width: 20,
  }) : null

  const fileInputStream = createReadStream(file)
  fileInputStream.on("error", reject)

  let stream: any = fileInputStream
  if (progressBar != null) {
    stream = stream.pipe(new ProgressCallbackTransform(fileStat.size, it => progressBar.tick(it.delta)))
  }

  stream.pipe(request)
}