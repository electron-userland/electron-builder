import { Url } from "url"
import { createHash } from "crypto"
import { Transform } from "stream"
import { createWriteStream } from "fs-extra-p"

export interface DownloadOptions {
  skipDirCreation?: boolean
  sha2?: string
  onProgress?(progress: any): void
}

export function download(url: string, destination: string, options?: DownloadOptions | null): Promise<string> {
  return executorHolder.httpExecutor.download(url, destination, options)
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

export const maxRedirects = 10

export abstract class HttpExecutor<REQUEST_OPTS, REQUEST> {
  request<T>(url: Url, token?: string | null, data?: {[name: string]: any; } | null, method?: string, headers?: any): Promise<T> {
    const defaultHeaders = {"User-Agent": "electron-builder"}
    const options = Object.assign({
      method: method,
      headers: headers == null ? defaultHeaders : Object.assign(defaultHeaders, headers)
    }, url)


    if (url.hostname!!.includes("github") && !url.path!.endsWith(".yml") && !options.headers.Accept) {
      options.headers["Accept"] = "application/vnd.github.v3+json"
    }

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
}

export class HttpError extends Error {
  constructor(public readonly response: {statusMessage?: string | undefined, statusCode?: number | undefined, headers?: { [key: string]: string[]; } | undefined}, public description: any | null = null) {
    super(response.statusCode + " " + response.statusMessage + (description == null ? "" : ("\n" + JSON.stringify(description, null, "  "))) + "\nHeaders: " + JSON.stringify(response.headers, null, "  "))

    this.name = "HttpError"
  }
}

export class ProgressCallbackTransform extends Transform {
  private start = Date.now()
  private transferred = 0
  private delta = 0

  private nextUpdate = this.start + 1000

  constructor(private total: number, private onProgress: (info: ProgressInfo) => any) {
    super()
  }

  _transform(chunk: any, encoding: string, callback: Function) {
    this.transferred += chunk.length
    this.delta += chunk.length

    const now = Date.now()
    if (now >= this.nextUpdate && this.transferred != this.total /* will be emitted on _flush */) {
      this.nextUpdate = now + 1000

      this.onProgress(<ProgressInfo>{
        total: this.total,
        delta: this.delta,
        transferred: this.transferred,
        percent: (this.transferred / this.total) * 100,
        bytesPerSecond: Math.round(this.transferred / ((now - this.start) / 1000))
      })
      this.delta = 0
    }

    callback(null, chunk)
  }

  _flush(callback: Function): void {
    this.onProgress(<ProgressInfo>{
      total: this.total,
      delta: this.delta,
      transferred: this.total,
      percent: 100,
      bytesPerSecond: Math.round(this.transferred / ((Date.now() - this.start) / 1000))
    })
    this.delta = 0

    callback(null)
  }
}

export interface ProgressInfo {
  total: number
  delta: number
  transferred: number
  percent: number
  bytesPerSecond: number
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

export const executorHolder = new HttpExecutorHolder()

export function githubRequest<T>(path: string, token: string | null, data: {[name: string]: any; } | null = null, method: string = "GET"): Promise<T> {
  return request<T>({hostname: "api.github.com", path: path}, token, data, method)
}

export function request<T>(url: Url, token: string | null = null, data: {[name: string]: any; } | null = null, method: string = "GET", headers?: any): Promise<T> {
  return executorHolder.httpExecutor.request(url, token, data, method, headers)
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
    lastStream = lastStream.pipe(stream)
  }

  fileOut.on("finish", () => (<any>fileOut.close)(callback))
}