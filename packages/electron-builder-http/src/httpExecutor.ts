import { createHash } from "crypto"
import _debug from "debug"
import { EventEmitter } from "events"
import { createWriteStream } from "fs-extra-p"
import { RequestOptions } from "http"
import { safeLoad } from "js-yaml"
import { Socket } from "net"
import { Transform } from "stream"
import { parse as parseUrl } from "url"
import { CancellationToken } from "./CancellationToken"
import { ProgressCallbackTransform, ProgressInfo } from "./ProgressCallbackTransform"

export interface RequestHeaders {
  [key: string]: any
}

export interface Response extends EventEmitter {
  statusCode?: number
  statusMessage?: string

  headers: any

  setEncoding(encoding: string): void
}

export interface DownloadOptions {
  readonly headers?: RequestHeaders | null
  readonly skipDirCreation?: boolean
  readonly sha2?: string | null

  readonly cancellationToken: CancellationToken

  onProgress?(progress: ProgressInfo): void
}

export class HttpExecutorHolder {
  private _httpExecutor: HttpExecutor<any, any>

  get httpExecutor(): HttpExecutor<any, any> {
    if (this._httpExecutor == null) {
      this._httpExecutor = new (require("electron-builder-util/out/nodeHttpExecutor").NodeHttpExecutor)()
    }
    return this._httpExecutor
  }

  set httpExecutor(value: HttpExecutor<any, any>) {
    this._httpExecutor = value
  }
}

export const executorHolder = new HttpExecutorHolder()

export function download(url: string, destination: string, options?: DownloadOptions | null): Promise<string> {
  return executorHolder.httpExecutor.download(url, destination, options || {cancellationToken: new CancellationToken()})
}

export class HttpError extends Error {
  constructor(public readonly response: {statusMessage?: string | undefined, statusCode?: number | undefined, headers?: { [key: string]: string[]; } | undefined}, public description: any | null = null) {
    super(response.statusCode + " " + response.statusMessage + (description == null ? "" : ("\n" + JSON.stringify(description, null, "  "))) + "\nHeaders: " + JSON.stringify(response.headers, null, "  "))

    this.name = "HttpError"
  }
}

export abstract class HttpExecutor<REQUEST_OPTS, REQUEST> {
  protected readonly maxRedirects = 10
  protected readonly debug = _debug("electron-builder")

  request<T>(options: RequestOptions, cancellationToken: CancellationToken, data?: { [name: string]: any; } | null): Promise<T> {
    configureRequestOptions(options)
    const encodedData = data == null ? undefined : new Buffer(JSON.stringify(data))
    if (encodedData != null) {
      options.method = "post"
      options.headers!["Content-Type"] = "application/json"
      options.headers!["Content-Length"] = encodedData.length
    }
    return this.doApiRequest<T>(<REQUEST_OPTS>options, cancellationToken, it => (<any>it).end(encodedData), 0)
  }

  protected abstract doApiRequest<T>(options: REQUEST_OPTS, cancellationToken: CancellationToken, requestProcessor: (request: REQUEST, reject: (error: Error) => void) => void, redirectCount: number): Promise<T>

  abstract download(url: string, destination: string, options: DownloadOptions): Promise<string>

  protected handleResponse(response: Response, options: RequestOptions, cancellationToken: CancellationToken, resolve: (data?: any) => void, reject: (error: Error) => void, redirectCount: number, requestProcessor: (request: REQUEST, reject: (error: Error) => void) => void) {
    if (this.debug.enabled) {
      this.debug(`Response status: ${response.statusCode} ${response.statusMessage}, request options: ${dumpRequestOptions(options)}`)
    }

    // we handle any other >= 400 error on request end (read detailed message in the response body)
    if (response.statusCode === 404) {
      // error is clear, we don't need to read detailed error description
      reject(new HttpError(response, `method: ${options.method} url: https://${options.hostname}${options.path}

    Please double check that your authentication token is correct. Due to security reasons actual status maybe not reported, but 404.
    `))
      return
    }
    else if (response.statusCode === 204) {
      // on DELETE request
      resolve()
      return
    }

    const redirectUrl = safeGetHeader(response, "location")
    if (redirectUrl != null) {
      if (redirectCount > 10) {
        reject(new Error("Too many redirects (> 10)"))
        return
      }

      this.doApiRequest(<REQUEST_OPTS>Object.assign({}, options, parseUrl(redirectUrl)), cancellationToken, requestProcessor, redirectCount)
        .then(resolve)
        .catch(reject)

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
        const isJson = contentType != null && (Array.isArray(contentType) ? contentType.find(it => it.includes("json")) != null : contentType.includes("json"))
        if (response.statusCode != null && response.statusCode >= 400) {
          reject(new HttpError(response, isJson ? JSON.parse(data) : data))
        }
        else {
          const pathname = (<any>options).pathname || options.path
          if (data.length === 0) {
            resolve()
          }
          else if (pathname != null && pathname.endsWith(".yml")) {
            resolve(safeLoad(data))
          }
          else {
            resolve(isJson || (pathname != null && pathname.endsWith(".json")) ? JSON.parse(data) : data)
          }
        }
      }
      catch (e) {
        reject(e)
      }
    })
  }

  protected abstract doRequest(options: any, callback: (response: any) => void): any

  protected doDownload(requestOptions: any, destination: string, redirectCount: number, options: DownloadOptions, callback: (error: Error | null) => void, onCancel: (callback: () => void) => void) {
    const request = this.doRequest(requestOptions, (response: Electron.IncomingMessage) => {
      if (response.statusCode >= 400) {
        callback(new Error(`Cannot download "${requestOptions.protocol || "https"}://${requestOptions.hostname}/${requestOptions.path}", status ${response.statusCode}: ${response.statusMessage}`))
        return
      }

      const redirectUrl = safeGetHeader(response, "location")
      if (redirectUrl != null) {
        if (redirectCount < this.maxRedirects) {
          const parsedUrl = parseUrl(redirectUrl)
          this.doDownload(Object.assign({}, requestOptions, {
            hostname: parsedUrl.hostname,
            path: parsedUrl.path,
            port: parsedUrl.port == null ? undefined : parsedUrl.port
          }), destination, redirectCount++, options, callback, onCancel)
        }
        else {
          callback(new Error(`Too many redirects (> ${this.maxRedirects})`))
        }
        return
      }

      configurePipes(options, response, destination, callback, options.cancellationToken)
    })
    this.addTimeOutHandler(request, callback)
    request.on("error", callback)
    onCancel(() => request.abort())
    request.end()
  }

  protected addTimeOutHandler(request: any, callback: (error: Error) => void) {
    request.on("socket", function (socket: Socket) {
      socket.setTimeout(60 * 1000, () => {
        callback(new Error("Request timed out"))
        request.abort()
      })
    })
  }
}

class DigestTransform extends Transform {
  private readonly digester = createHash("sha256")

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

export function request<T>(options: RequestOptions, cancellationToken: CancellationToken, data?: {[name: string]: any; } | null): Promise<T> {
  return executorHolder.httpExecutor.request(options, cancellationToken, data)
}

function checkSha2(sha2Header: string | null | undefined, sha2: string | null | undefined, callback: (error: Error | null) => void): boolean {
  if (sha2Header != null && sha2 != null) {
    // todo why bintray doesn't send this header always
    if (sha2Header == null) {
      callback(new Error("checksum is required, but server response doesn't contain X-Checksum-Sha2 header"))
      return false
    }
    else if (sha2Header !== sha2) {
      callback(new Error(`checksum mismatch: expected ${sha2} but got ${sha2Header} (X-Checksum-Sha2 header)`))
      return false
    }
  }
  return true
}

function safeGetHeader(response: any, headerKey: string) {
  const value = response.headers[headerKey]
  if (value == null) {
    return null
  }
  else if (Array.isArray(value)) {
    // electron API
    return value.length === 0 ? null : value[value.length - 1]
  }
  else {
    return value
  }
}

function configurePipes(options: DownloadOptions, response: any, destination: string, callback: (error: Error | null) => void, cancellationToken: CancellationToken) {
  if (!checkSha2(safeGetHeader(response, "X-Checksum-Sha2"), options.sha2, callback)) {
    return
  }

  const streams: Array<any> = []
  if (options.onProgress != null) {
    const contentLength = safeGetHeader(response, "content-length")
    if (contentLength != null) {
      streams.push(new ProgressCallbackTransform(parseInt(contentLength, 10), options.cancellationToken, options.onProgress))
    }
  }

  if (options.sha2 != null) {
    streams.push(new DigestTransform(options.sha2))
  }

  const fileOut = createWriteStream(destination)
  streams.push(fileOut)

  let lastStream = response
  for (const stream of streams) {
    stream.on("error", (error: Error) => {
      if (!cancellationToken.cancelled) {
        callback(error)
      }
    })
    lastStream = lastStream.pipe(stream)
  }

  fileOut.on("finish", () => {
    (<any>fileOut.close)(callback)
  })
}

export function configureRequestOptions(options: RequestOptions, token?: string | null, method?: "GET" | "DELETE" | "PUT"): RequestOptions {
  if (method != null) {
    options.method = method
  }

  let headers = options.headers
  if (headers == null) {
    headers = {}
    options.headers = headers
  }
  if (token != null) {
    (<any>headers).authorization = token.startsWith("Basic") ? token : `token ${token}`
  }
  if (headers["User-Agent"] == null) {
    headers["User-Agent"] = "electron-builder"
  }

  if ((method == null || method === "GET") || headers["Cache-Control"] == null) {
    headers["Cache-Control"] = "no-cache"
  }
  return options
}

export function dumpRequestOptions(options: RequestOptions): string {
  const safe: any = Object.assign({}, options)
  if (safe.headers != null && safe.headers.authorization != null) {
    safe.headers.authorization = "<skipped>"
  }
  return JSON.stringify(safe, null, 2)
}