import { Socket } from "net"
import { IncomingMessage, ClientRequest } from "http"
import * as https from "https"
import { createWriteStream, ensureDir } from "fs-extra-p"
import { parse as parseUrl } from "url"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"

const maxRedirects = 10

export const download = <(url: string, destination: string, isCreateDir?: boolean | undefined) => BluebirdPromise<any>>(BluebirdPromise.promisify(_download))

function _download(url: string, destination: string, isCreateDir: boolean | undefined, callback: (error: Error) => void): void {
  if (callback == null) {
    callback = <any>isCreateDir
    isCreateDir = true
  }
  doDownload(url, destination, 0, isCreateDir === undefined ? true : isCreateDir, callback)
}

export function addTimeOutHandler(request: ClientRequest, callback: (error: Error) => void) {
  request.on("socket", function (socket: Socket) {
    socket.setTimeout(60 * 1000, () => {
      callback(new Error("Request timed out"))
      request.abort()
    })
  })
}

function doDownload(url: string, destination: string, redirectCount: number, isCreateDir: boolean, callback: (error: Error) => void) {
  const ensureDirPromise = isCreateDir ? ensureDir(path.dirname(destination)) : BluebirdPromise.resolve()

  const parsedUrl = parseUrl(url)
  // user-agent must be specified, otherwise some host can return 401 unauthorised
  const request = https.request({
    hostname: parsedUrl.hostname,
    path: parsedUrl.path,
    headers: {
      "User-Agent": "electron-builder"
    }
  }, (response: IncomingMessage) => {
    if (response.statusCode >= 400) {
      callback(new Error("Request error, status " + response.statusCode + ": " + response.statusMessage))
      return
    }

    const redirectUrl = response.headers.location
    if (redirectUrl != null) {
      if (redirectCount < maxRedirects) {
        doDownload(redirectUrl, destination, redirectCount++, isCreateDir, callback)
      }
      else {
        callback(new Error("Too many redirects (> " + maxRedirects + ")"))
      }
      return
    }

    ensureDirPromise
      .then(() => {
        const downloadStream = createWriteStream(destination)
        response.pipe(downloadStream)
        downloadStream.on("finish", () => downloadStream.close(callback))
      })
      .catch(callback)

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