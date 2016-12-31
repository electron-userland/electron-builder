import { Url } from "url"
import { createHash } from "crypto"
import { Transform } from "stream"

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
  }
}

export class DigestTransform extends Transform {
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

export function checkSha2(sha2Header: string | null | undefined, sha2: string | null | undefined, callback: (error: Error | null) => void): boolean {
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

export function calculateDownloadProgress(total: number, start: number, transferred: number, chunk: any, callback: any): number {
    transferred += chunk.length
    callback({
      total: total,
      transferred: transferred,
      percent: ((transferred / total) * 100).toFixed(2),
      bytesPerSecond: Math.round(transferred / ((Date.now() - start) / 1000))
    })
    return transferred
}