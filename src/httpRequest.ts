import { Socket } from "net"
import { IncomingMessage, ClientRequest } from "http"
import * as https from "https"
import { createWriteStream, ensureDir } from "fs-extra-p"
import { parse as parseUrl } from "url"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"

const maxRedirects = 10

export interface DownloadOptions {
  skipDirCreation?: boolean
  sha2?: string
}

export const download = <(url: string, destination: string, options?: DownloadOptions) => BluebirdPromise<any>>(BluebirdPromise.promisify(_download))

function _download(url: string, destination: string, options: DownloadOptions | n, callback: (error: Error) => void): void {
  if (callback == null) {
    callback = <any>options
    options = null
  }
  doDownload(url, destination, 0, options || {}, callback)
}

export function addTimeOutHandler(request: ClientRequest, callback: (error: Error) => void) {
  request.on("socket", function (socket: Socket) {
    socket.setTimeout(60 * 1000, () => {
      callback(new Error("Request timed out"))
      request.abort()
    })
  })
}

function doDownload(url: string, destination: string, redirectCount: number, options: DownloadOptions, callback: (error: Error) => void) {
  const ensureDirPromise = options.skipDirCreation ? BluebirdPromise.resolve() : ensureDir(path.dirname(destination))

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
        doDownload(redirectUrl, destination, redirectCount++, options, callback)
      }
      else {
        callback(new Error("Too many redirects (> " + maxRedirects + ")"))
      }
      return
    }

    const sha1Header = response.headers["X-Checksum-Sha1"]
    if (sha1Header != null && options.sha2 != null) {
      // todo why bintray doesn't send this header always
      if (sha1Header == null) {
        throw new Error("checksum is required, but server response doesn't contain X-Checksum-Sha2 header")
      }
      else if (sha1Header !== options.sha2) {
        throw new Error(`checksum mismatch: expected ${options.sha2} but got ${sha1Header} (X-Checksum-Sha2 header)`)
      }
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