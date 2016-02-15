import { Socket } from "net"
import { IncomingMessage, ClientRequest } from "http"
import * as https from "https"
import { createWriteStream } from "fs"
import { parse as parseUrl } from "url"
import { Promise as BluebirdPromise } from "bluebird"

const maxRedirects = 10

export const download = BluebirdPromise.promisify(_download)

function _download(url: string, destination: string, callback: (error: Error) => void): void {
  doDownload(url, destination, 0, callback)
}

export function addTimeOutHandler(request: ClientRequest, callback: (error: Error | string) => void) {
  request.on("socket", function (socket: Socket) {
    socket.setTimeout(60 * 1000, () => {
      callback("Request timed out")
      request.abort()
    })
  })
}

function doDownload(url: string, destination: string, redirectCount: number, callback: (error: Error) => void) {
  const parsedUrl = parseUrl(url)
  // user-agent must be specified, otherwise some host can return 401 unauthorised
  const request = https.request({
    hostname: parsedUrl.hostname,
    path: parsedUrl.path,
    headers: {
      "User-Agent": "electron-complete-builder"
    }
  }, (response: IncomingMessage) => {
    if (response.statusCode >= 400) {
      callback(new Error("Request error, status " + response.statusCode + ": " + response.statusMessage))
      return
    }

    const redirectUrl = response.headers.location
    if (redirectUrl != null) {
      if (redirectCount < maxRedirects) {
        doDownload(redirectUrl, destination, redirectCount++, callback)
      }
      else {
        callback(new Error("Too many redirects (> " + maxRedirects + ")"))
      }
      return
    }

    const downloadStream = createWriteStream(destination)
    response.pipe(downloadStream)
    downloadStream.on("finish", () => downloadStream.close(callback))

    let ended = false
    response.on("end", () => {
      ended = true
    })

    response.on("close", () => {
      if (!ended) {
        callback(new Error("Request aborted"))
      }
    })
  })
  addTimeOutHandler(request, callback)
  request.on("error", callback)
  request.end()
}