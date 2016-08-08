import progressStream = require("progress-stream")
import ProgressBar = require("progress")
import { createReadStream, Stats } from "fs-extra-p"
import { ReadStream } from "tty"
import { ClientRequest } from "http"

export function uploadFile(file: string, fileStat: Stats, fileName: string, request: ClientRequest, reject: (error: Error) => void) {
  const progressBar = (<ReadStream>process.stdin).isTTY ? new ProgressBar(`Uploading ${fileName} [:bar] :percent :etas`, {
    total: fileStat.size,
    incomplete: " ",
    stream: process.stdout,
    width: 20,
  }) : null

  const fileInputStream = createReadStream(file)
  fileInputStream.on("error", reject)
  fileInputStream
    .pipe(progressStream({
      length: fileStat.size,
      time: 1000
    }, progress => {
      if (progressBar != null) {
        progressBar.tick(progress.delta)
      }
    }))
    .pipe(request)
}