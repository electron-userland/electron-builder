import { Socket } from "net"
import { net } from "electron"
import { createWriteStream, ensureDir } from "fs-extra-p"
import BluebirdPromise from "bluebird-lst-c"
import * as path from "path"
import { createHash } from "crypto"
import { Transform } from "stream"
import { HttpExecutor, DownloadOptions, HttpError } from "../../src/util/httpExecutor"
import { Url } from "url"
import { safeLoad } from "js-yaml"
import _debug from "debug"
import Debugger = debug.Debugger
import { parse as parseUrl } from "url"


export class ElectronHttpExecutor implements HttpExecutor {

  private readonly debug: Debugger = _debug("electron-builder")

  private readonly maxRedirects = 10

  request<T>(url: Url, token: string | null = null, data: {[name: string]: any; } | null = null, method: string = "GET"): Promise<T> {
    const options: any = Object.assign({
      method: method,
      headers: {
        "User-Agent": "electron-builder"
      }
    }, url)

    if (url.hostname!!.includes("github") && !url.path!.endsWith(".yml")) {
      options.headers.Accept = "application/vnd.github.v3+json"
    }

    const encodedData = data == null ? undefined : new Buffer(JSON.stringify(data))
    if (encodedData != null) {
      options.method = "post"
      options.headers["Content-Type"] = "application/json"
      options.headers["Content-Length"] = encodedData.length
    }
    return this.doApiRequest<T>(options, token, it => it.end(encodedData))
  }

  download(url: string, destination: string, options?: DownloadOptions | null): Promise<string> {
      return new BluebirdPromise( (resolve, reject) => {
        this.doDownload(url, destination, 0, options || {}, (error: Error) => {
          if (error == null) {
            resolve(destination)
          }
          else {
            reject(error)
          }
        })
      })
  }

  private addTimeOutHandler(request: Electron.ClientRequest, callback: (error: Error) => void) {
    request.on("socket", function (socket: Socket) {
      socket.setTimeout(60 * 1000, () => {
        callback(new Error("Request timed out"))
        request.abort()
      })
    })
  }

  private doDownload(url: string, destination: string, redirectCount: number, options: DownloadOptions, callback: (error: Error | null) => void) {
    const ensureDirPromise = options.skipDirCreation ? BluebirdPromise.resolve() : ensureDir(path.dirname(destination))

    const parsedUrl = parseUrl(url)
    // user-agent must be specified, otherwise some host can return 401 unauthorised

    //FIXME hack, the electron typings specifies Protocol with capital but the code actually uses with small case
    const requestOpts  = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      headers: {
        "User-Agent": "electron-builder"
      },
    }

    const request = net.request(requestOpts, (response: Electron.IncomingMessage) => {
      if (response.statusCode >= 400) {
        callback(new Error(`Cannot download "${url}", status ${response.statusCode}: ${response.statusMessage}`))
        return
      }

      const redirectUrl = this.safeGetHeader(response, "location")
      if (redirectUrl != null) {
        if (redirectCount < this.maxRedirects) {
          this.doDownload(redirectUrl, destination, redirectCount++, options, callback)
        }
        else {
          callback(new Error("Too many redirects (> " + this.maxRedirects + ")"))
        }
        return
      }

      const sha2Header = this.safeGetHeader(response, "X-Checksum-Sha2")
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
    this.addTimeOutHandler(request, callback)
    request.on("error", callback)
    request.end()
  }

  private safeGetHeader(response: Electron.IncomingMessage, headerKey: string) {
    return response.headers[headerKey] ? response.headers[headerKey].pop() : null
  }


  doApiRequest<T>(options: Electron.RequestOptions, token: string | null, requestProcessor: (request: Electron.ClientRequest, reject: (error: Error) => void) => void, redirectCount: number = 0): Promise<T> {
    const requestOptions: any = options
    this.debug(`HTTPS request: ${JSON.stringify(requestOptions, null, 2)}`)

    if (token != null) {
      (<any>requestOptions.headers).authorization = token.startsWith("Basic") ? token : `token ${token}`
    }

    requestOptions.protocol = "https:"
    return new BluebirdPromise<T>((resolve, reject, onCancel) => {
      const request = net.request(options, (response: Electron.IncomingMessage) => {
        try {
          if (response.statusCode === 404) {
            // error is clear, we don't need to read detailed error description
            reject(new HttpError(response, `method: ${options.method} url: https://${options.hostname}${options.path}

Please double check that your authentication token is correct. Due to security reasons actual status maybe not reported, but 404.
`))
          }
          else if (response.statusCode === 204) {
            // on DELETE request
            resolve()
            return
          }

          const redirectUrl = this.safeGetHeader(response, "location")
          if (redirectUrl != null) {
            if (redirectCount > 10) {
              reject(new Error("Too many redirects (> 10)"))
              return
            }

            if (options.path!.endsWith("/latest")) {
              resolve(<any>{location: redirectUrl})
            }
            else {
              this.doApiRequest(Object.assign({}, options, parseUrl(redirectUrl)), token, requestProcessor)
                .then(<any>resolve)
                .catch(reject)
            }
            return
          }

          let data = ""
          response.setEncoding("utf8")
          response.on("data", (chunk: string) => {
            data += chunk
          })

          response.on("end", () => {
            try {
              const contentType = response.headers["content-type"]
              const isJson = contentType != null && contentType.includes("json")
              if (response.statusCode >= 400) {
                if (isJson) {
                  reject(new HttpError(response, JSON.parse(data)))
                }
                else {
                  reject(new HttpError(response))
                }
              }
              else {
                resolve(data.length === 0 ? null : (isJson || !options.path!.includes(".yml")) ? JSON.parse(data) : safeLoad(data))
              }
            }
            catch (e) {
              reject(e)
            }
          })
        }
        catch (e) {
          reject(e)
        }
      })
      this.addTimeOutHandler(request, reject)
      request.on("error", reject)
      requestProcessor(request, reject)
      onCancel!(() => request.abort())
    })
  }
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
