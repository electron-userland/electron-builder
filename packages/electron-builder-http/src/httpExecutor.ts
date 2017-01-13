import { Url } from "url"
import { createHash } from "crypto"
import { Transform } from "stream"
import { createWriteStream } from "fs-extra-p"
import { RequestOptions } from "http"
import { parse as parseUrl } from "url"
import _debug from "debug"
import { ProgressCallbackTransform } from "./ProgressCallbackTransform"
import { safeLoad } from "js-yaml"
import { EventEmitter } from "events"

export const debug = _debug("electron-builder")
export const maxRedirects = 10

export interface DownloadOptions {
  skipDirCreation?: boolean
  sha2?: string
  onProgress?(progress: any): void
}

export class HttpExecutorHolder {
  private _httpExecutor: HttpExecutor<any, any>

  get httpExecutor(): HttpExecutor<any, any> {
    if (this._httpExecutor == null) {
      this._httpExecutor = new (require("electron-builder/out/util/nodeHttpExecutor").NodeHttpExecutor)()
    }
    return this._httpExecutor
  }

  set httpExecutor(value: HttpExecutor<any, any>) {
    this._httpExecutor = value
  }
}

export const executorHolder = new HttpExecutorHolder()

export function download(url: string, destination: string, options?: DownloadOptions | null): Promise<string> {
  return executorHolder.httpExecutor.download(url, destination, options)
}

export abstract class HttpExecutor<REQUEST_OPTS, REQUEST> {
  request<T>(url: Url, token?: string | null, data?: {[name: string]: any; } | null, headers?: { [key: string]: any } | null, method?: string): Promise<T> {
    const defaultHeaders: any = {"User-Agent": "electron-builder"}
    const options = Object.assign({
      method: method || "GET",
      headers: headers == null ? defaultHeaders : Object.assign(defaultHeaders, headers)
    }, url)

    const encodedData = data == null ? undefined : new Buffer(JSON.stringify(data))
    if (encodedData != null) {
      options.method = "post"
      options.headers["Content-Type"] = "application/json"
      options.headers["Content-Length"] = encodedData.length
    }
    return this.doApiRequest<T>(<any>options, token || null, it => (<any>it).end(encodedData), 0)
  }

  protected abstract doApiRequest<T>(options: REQUEST_OPTS, token: string | null, requestProcessor: (request: REQUEST, reject: (error: Error) => void) => void, redirectCount: number): Promise<T>

  abstract download(url: string, destination: string, options?: DownloadOptions | null): Promise<string>

  protected handleResponse(response: Response, options: RequestOptions, resolve: (data?: any) => void, reject: (error: Error) => void, redirectCount: number, token: string | null, requestProcessor: (request: REQUEST, reject: (error: Error) => void) => void) {
    if (debug.enabled) {
      const safe: any = Object.assign({}, options)
      if (safe.headers != null && safe.headers.authorization != null) {
        safe.headers.authorization = "<skipped>"
      }
      debug(`Response status: ${response.statusCode} ${response.statusMessage}, request options: ${JSON.stringify(safe, null, 2)}`)
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

      this.doApiRequest(<REQUEST_OPTS>Object.assign({}, options, parseUrl(redirectUrl)), token, requestProcessor, redirectCount)
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
        if (response.statusCode >= 400) {
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
}

export class HttpError extends Error {
  constructor(public readonly response: {statusMessage?: string | undefined, statusCode?: number | undefined, headers?: { [key: string]: string[]; } | undefined}, public description: any | null = null) {
    super(response.statusCode + " " + response.statusMessage + (description == null ? "" : ("\n" + JSON.stringify(description, null, "  "))) + "\nHeaders: " + JSON.stringify(response.headers, null, "  "))

    this.name = "HttpError"
  }
}

export interface Response extends EventEmitter {
  statusCode?: number
  statusMessage?: string

  headers: any

  setEncoding(encoding: string): void
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

export function githubRequest<T>(path: string, token: string | null, data: {[name: string]: any; } | null = null, method?: string): Promise<T> {
  return executorHolder.httpExecutor.request<T>({hostname: "api.github.com", path: path}, token, data, {Accept: "application/vnd.github.v3+json"}, method)
}

export function request<T>(url: Url, token: string | null = null, data: {[name: string]: any; } | null = null, headers?: { [key: string]: any } | null, method?: string): Promise<T> {
  return executorHolder.httpExecutor.request(url, token, data, headers, method)
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

export function safeGetHeader(response: any, headerKey: string) {
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

export function configurePipes(options: DownloadOptions, response: any, destination: string, callback: (error: Error | null) => void) {
  if (!checkSha2(safeGetHeader(response, "X-Checksum-Sha2"), options.sha2, callback)) {
    return
  }

  const streams: Array<any> = []
  if (options.onProgress != null) {
    const contentLength = safeGetHeader(response, "content-length")
    if (contentLength != null) {
      streams.push(new ProgressCallbackTransform(parseInt(contentLength, 10), options.onProgress))
    }
  }

  if (options.sha2 != null) {
    streams.push(new DigestTransform(options.sha2))
  }

  const fileOut = createWriteStream(destination)
  streams.push(fileOut)

  let lastStream = response
  for (const stream of streams) {
    stream.on("error", callback)
    lastStream = lastStream.pipe(stream)
  }

  fileOut.on("finish", () => (<any>fileOut.close)(callback))
}