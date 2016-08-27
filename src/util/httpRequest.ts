import { Socket } from "net"
import { IncomingMessage, ClientRequest } from "http"
import * as https from "https"
import { createWriteStream, ensureDir } from "fs-extra-p"
import { parse as parseUrl } from "url"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import { createHash } from "crypto"
import { Transform } from "stream"

const maxRedirects = 10

export interface DownloadOptions {
  skipDirCreation?: boolean
  sha2?: string
}

export const download = <(url: string, destination: string, options?: DownloadOptions) => BluebirdPromise<any>>(BluebirdPromise.promisify(_download))

function _download(url: string, destination: string, options: DownloadOptions | null | undefined, callback: (error: Error) => void): void {
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

function doDownload(url: string, destination: string, redirectCount: number, options: DownloadOptions, callback: (error: Error | null) => void) {
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
      callback(new Error(`Cannot download "${url}", status ${response.statusCode}: ${response.statusMessage}`))
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

    const sha2Header = response.headers["X-Checksum-Sha2"]
    if (sha2Header != null && options.sha2 != null) {
      // todo why bintray doesn't send this header always
      if (sha2Header == null) {
        throw new Error("checksum is required, but server response doesn't contain X-Checksum-Sha2 header")
      }
      else if (sha2Header !== options.sha2) {
        throw new Error(`checksum mismatch: expected ${options.sha2} but got ${sha2Header} (X-Checksum-Sha2 header)`)
      }
    }

    ensureDirPromise
      .then(() => {
        const fileOut = createWriteStream(destination)
        if (options.sha2 == null) {
          response.pipe(fileOut)
        }
        else {
          response
            .pipe(new DigestTransform(options.sha2))
            .pipe(fileOut)
        }

        fileOut.on("finish", () => (<any>fileOut.close)(callback))
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

class DigestTransform extends Transform {
  readonly digester = createHash("sha256")

  constructor(private expected: string) {
   super()
  }

  _transform(chunk: any, encoding: string, callback: Function) {
    this.digester.update(chunk)
    callback(null, chunk)
  }

  _flush(callback: Function): void {
    const hash = this.digester.digest("hex")
    callback(hash === this.expected ? null : new Error(`SHA2 checksum mismatch, expected ${this.expected}, got ${hash}`))
  }
}