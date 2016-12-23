import { Url } from "url"
import { createHash } from "crypto"
import { Transform } from "stream"

export interface DownloadOptions {
  skipDirCreation?: boolean
  sha2?: string
}

export class HttpExecutorHolder {
  private _httpExecutor: HttpExecutor

  get httpExecutor(): HttpExecutor {
    if (this._httpExecutor == null) {
      this._httpExecutor = new (require((<any>global).__test_app == null ? "./nodeHttpExecutor" : "out/util/nodeHttpExecutor").NodeHttpExecutor)()
    }
    return this._httpExecutor
  }

  set httpExecutor(value: HttpExecutor) {
    this._httpExecutor = value
  }
}

export interface HttpExecutor {
  request<T>(url: Url, token?: string | null, data?: {[name: string]: any; } | null, method?: string): Promise<T>

  download(url: string, destination: string, options?: DownloadOptions | null): Promise<string>
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

export function request<T>(url: Url, token: string | null = null, data: {[name: string]: any; } | null = null, method: string = "GET"): Promise<T> {
  return executorHolder.httpExecutor.request(url, token, data, method)
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