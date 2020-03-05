import { createHash, Hash } from "crypto"
import _debug from "debug"
import { createWriteStream } from "fs"
import { IncomingMessage, OutgoingHttpHeaders, RequestOptions } from "http"
import { Socket } from "net"
import { Transform } from "stream"
import { URL } from "url"
import { CancellationToken } from "./CancellationToken"
import { newError } from "./index"
import { ProgressCallbackTransform, ProgressInfo } from "./ProgressCallbackTransform"

const debug = _debug("electron-builder")

export interface RequestHeaders extends OutgoingHttpHeaders {
  [key: string]: string
}

export interface DownloadOptions {
  readonly headers?: OutgoingHttpHeaders | null
  readonly sha2?: string | null
  readonly sha512?: string | null

  readonly cancellationToken: CancellationToken

  // noinspection JSUnusedLocalSymbols
  onProgress?(progress: ProgressInfo): void
}

export function createHttpError(response: IncomingMessage, description: any | null = null) {
  return new HttpError(response.statusCode || -1, `${response.statusCode} ${response.statusMessage}` + (description == null ? "" : ("\n" + JSON.stringify(description, null, "  "))) + "\nHeaders: " + safeStringifyJson(response.headers), description)
}

const HTTP_STATUS_CODES = new Map<number, string>([
  [429, "Too many requests"],
  [400, "Bad request"],
  [403, "Forbidden"],
  [404, "Not found"],
  [405, "Method not allowed"],
  [406, "Not acceptable"],
  [408, "Request timeout"],
  [413, "Request entity too large"],
  [500, "Internal server error"],
  [502, "Bad gateway"],
  [503, "Service unavailable"],
  [504, "Gateway timeout"],
  [505, "HTTP version not supported"],
])

export class HttpError extends Error {
  constructor(readonly statusCode: number, message: string = `HTTP error: ${HTTP_STATUS_CODES.get(statusCode) || statusCode}`, readonly description: any | null = null) {
    super(message)

    this.name = "HttpError";
    (this as NodeJS.ErrnoException).code = `HTTP_ERROR_${statusCode}`
  }
}

export function parseJson(result: Promise<string | null>) {
  return result.then(it => it == null || it.length === 0 ? null : JSON.parse(it))
}

export abstract class HttpExecutor<REQUEST> {
  protected readonly maxRedirects = 10

  request(options: RequestOptions, cancellationToken: CancellationToken = new CancellationToken(), data?: { [name: string]: any } | null): Promise<string | null> {
    configureRequestOptions(options)
    const encodedData = data == null ? undefined : Buffer.from(JSON.stringify(data))
    if (encodedData != null) {
      options.method = "post"
      options.headers!["Content-Type"] = "application/json"
      options.headers!["Content-Length"] = encodedData.length
    }
    return this.doApiRequest(options, cancellationToken, it => {
      (it as any).end(encodedData)
    })
  }

  doApiRequest(options: RequestOptions, cancellationToken: CancellationToken, requestProcessor: (request: REQUEST, reject: (error: Error) => void) => void, redirectCount: number = 0): Promise<string> {
    if (debug.enabled) {
      debug(`Request: ${safeStringifyJson(options)}`)
    }

    return cancellationToken.createPromise<string>((resolve, reject, onCancel) => {
      const request = this.createRequest(options, (response: any) => {
        try {
          this.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)
        }
        catch (e) {
          reject(e)
        }
      })
      this.addErrorAndTimeoutHandlers(request, reject)
      this.addRedirectHandlers(request, options, reject, redirectCount, options => {
        this.doApiRequest(options, cancellationToken, requestProcessor, redirectCount)
          .then(resolve)
          .catch(reject)
      })
      requestProcessor(request, reject)
      onCancel(() => request.abort())
    })
  }

  // noinspection JSUnusedLocalSymbols
  // eslint-disable-next-line
  protected addRedirectHandlers(request: any, options: RequestOptions, reject: (error: Error) => void, redirectCount: number, handler: (options: RequestOptions) => void) {
    // not required for NodeJS
  }

  addErrorAndTimeoutHandlers(request: any, reject: (error: Error) => void) {
    this.addTimeOutHandler(request, reject)
    request.on("error", reject)
    request.on("aborted", () => {
      reject(new Error("Request has been aborted by the server"))
    })
  }

  private handleResponse(response: IncomingMessage,
                         options: RequestOptions,
                         cancellationToken: CancellationToken,
                         resolve: (data?: any) => void,
                         reject: (error: Error) => void,
                         redirectCount: number,
                         requestProcessor: (request: REQUEST, reject: (error: Error) => void) => void) {
    if (debug.enabled) {
      debug(`Response: ${response.statusCode} ${response.statusMessage}, request options: ${safeStringifyJson(options)}`)
    }

    // we handle any other >= 400 error on request end (read detailed message in the response body)
    if (response.statusCode === 404) {
      // error is clear, we don't need to read detailed error description
      reject(createHttpError(response, `method: ${options.method || "GET"} url: ${options.protocol || "https:"}//${options.hostname}${options.port ? `:${options.port}` : ""}${options.path}

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
      if (redirectCount > this.maxRedirects) {
        reject(this.createMaxRedirectError())
        return
      }

      this.doApiRequest(HttpExecutor.prepareRedirectUrlOptions(redirectUrl, options), cancellationToken, requestProcessor, redirectCount)
        .then(resolve)
        .catch(reject)
      return
    }

    response.setEncoding("utf8")

    let data = ""
    response.on("error", reject)
    response.on("data", (chunk: string) => data += chunk)
    response.on("end", () => {
      try {
        if (response.statusCode != null && response.statusCode >= 400) {
          const contentType = safeGetHeader(response, "content-type")
          const isJson = contentType != null && (Array.isArray(contentType) ? contentType.find(it => it.includes("json")) != null : contentType.includes("json"))
          reject(createHttpError(response, isJson ? JSON.parse(data) : data))
        }
        else {
          resolve(data.length === 0 ? null : data)
        }
      }
      catch (e) {
        reject(e)
      }
    })
  }

  // noinspection JSUnusedLocalSymbols
  abstract createRequest(options: any, callback: (response: any) => void): any

  async downloadToBuffer(url: URL, options: DownloadOptions): Promise<Buffer> {
    return await options.cancellationToken.createPromise<Buffer>((resolve, reject, onCancel) => {
      let result: Buffer | null = null
      const requestOptions = {
        headers: options.headers || undefined,
        // because PrivateGitHubProvider requires HttpExecutor.prepareRedirectUrlOptions logic, so, we need to redirect manually
        redirect: "manual",
      }
      configureRequestUrl(url, requestOptions)
      configureRequestOptions(requestOptions)
      this.doDownload(requestOptions, {
        destination: null,
        options,
        onCancel,
        callback: error => {
          if (error == null) {
            resolve(result!!)
          }
          else {
            reject(error)
          }
        },
        responseHandler: (response, callback) => {
          const contentLength = safeGetHeader(response, "content-length")
          let position = -1
          if (contentLength != null) {
            const size = parseInt(contentLength, 10)
            if (size > 0) {
              if (size > 52428800) {
                callback(new Error("Maximum allowed size is 50 MB"))
                return
              }

              result = Buffer.alloc(size)
              position = 0
            }
          }
          response.on("data", (chunk: Buffer) => {
            if (position !== -1) {
              chunk.copy(result!!, position)
              position += chunk.length
            }
            else if (result == null) {
              result = chunk
            }
            else {
              if (result.length > 52428800) {
                callback(new Error("Maximum allowed size is 50 MB"))
                return
              }
              result = Buffer.concat([result, chunk])
            }
          })
          response.on("end", () => {
            if (result != null && position !== -1 && position !== result.length) {
              callback(new Error(`Received data length ${position} is not equal to expected ${result.length}`))
            }
            else {
              callback(null)
            }
          })
        },
      }, 0)
    })
  }

  protected doDownload(requestOptions: any, options: DownloadCallOptions, redirectCount: number) {
    const request = this.createRequest(requestOptions, (response: IncomingMessage) => {
      if (response.statusCode! >= 400) {
        options.callback(new Error(`Cannot download "${requestOptions.protocol || "https:"}//${requestOptions.hostname}${requestOptions.path}", status ${response.statusCode}: ${response.statusMessage}`))
        return
      }

      // It is possible for the response stream to fail, e.g. when a network is lost while
      // response stream is in progress. Stop waiting and reject so consumer can catch the error.
      response.on("error", options.callback)

      // this code not relevant for Electron (redirect event instead handled)
      const redirectUrl = safeGetHeader(response, "location")
      if (redirectUrl != null) {
        if (redirectCount < this.maxRedirects) {
          this.doDownload(HttpExecutor.prepareRedirectUrlOptions(redirectUrl, requestOptions), options, redirectCount++)
        }
        else {
          options.callback(this.createMaxRedirectError())
        }
        return
      }

      if (options.responseHandler == null) {
        configurePipes(options, response)
      }
      else {
        options.responseHandler(response, options.callback)
      }
    })
    this.addErrorAndTimeoutHandlers(request, options.callback)
    this.addRedirectHandlers(request, requestOptions, options.callback, redirectCount, requestOptions => {
      this.doDownload(requestOptions, options, redirectCount++)
    })
    request.end()
  }

  protected createMaxRedirectError() {
    return new Error(`Too many redirects (> ${this.maxRedirects})`)
  }

  private addTimeOutHandler(request: any, callback: (error: Error) => void) {
    request.on("socket", (socket: Socket) => {
      socket.setTimeout(60 * 1000, () => {
        request.abort()
        callback(new Error("Request timed out"))
      })
    })
  }

  static prepareRedirectUrlOptions(redirectUrl: string, options: RequestOptions): RequestOptions {
    const newOptions = configureRequestOptionsFromUrl(redirectUrl, {...options})
    const headers = newOptions.headers
    if (headers != null && headers.authorization != null && (headers.authorization as string).startsWith("token")) {
      const parsedNewUrl = new URL(redirectUrl)
      if (parsedNewUrl.hostname.endsWith(".amazonaws.com")) {
        delete headers.authorization
      }
    }
    return newOptions
  }
}

export interface DownloadCallOptions {
  responseHandler: ((response: IncomingMessage, callback: (error: Error | null) => void) => void) | null
  onCancel: (callback: () => void) => void
  callback: (error: Error | null) => void

  options: DownloadOptions

  destination: string | null
}

export function configureRequestOptionsFromUrl(url: string, options: RequestOptions) {
  const result = configureRequestOptions(options)
  configureRequestUrl(new URL(url), result)
  return result
}

export function configureRequestUrl(url: URL, options: RequestOptions): void {
  options.protocol = url.protocol
  options.hostname = url.hostname
  if (url.port) {
    options.port = url.port
  }
  else if (options.port) {
    delete options.port
  }
  options.path = url.pathname + url.search
}

export class DigestTransform extends Transform {
  private readonly digester: Hash

  private _actual: string | null = null

  // noinspection JSUnusedGlobalSymbols
  get actual() {
    return this._actual
  }

  isValidateOnEnd: boolean = true

  constructor(readonly expected: string, private readonly algorithm: string = "sha512", private readonly encoding: "hex" | "base64" | "latin1" = "base64") {
    super()

    this.digester = createHash(algorithm)
  }

  // noinspection JSUnusedGlobalSymbols
  _transform(chunk: Buffer, encoding: string, callback: any) {
    this.digester.update(chunk)
    callback(null, chunk)
  }

  // noinspection JSUnusedGlobalSymbols
  _flush(callback: any): void {
    this._actual = this.digester.digest(this.encoding)

    if (this.isValidateOnEnd) {
      try {
        this.validate()
      }
      catch (e) {
        callback(e)
        return
      }
    }

    callback(null)
  }

  validate() {
    if (this._actual == null) {
      throw newError("Not finished yet", "ERR_STREAM_NOT_FINISHED")
    }

    if (this._actual !== this.expected) {
      throw newError(`${this.algorithm} checksum mismatch, expected ${this.expected}, got ${this._actual}`, "ERR_CHECKSUM_MISMATCH")
    }

    return null
  }
}

function checkSha2(sha2Header: string | null | undefined, sha2: string | null | undefined, callback: (error: Error | null) => void): boolean {
  if (sha2Header != null && sha2 != null && sha2Header !== sha2) {
    callback(new Error(`checksum mismatch: expected ${sha2} but got ${sha2Header} (X-Checksum-Sha2 header)`))
    return false
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

function configurePipes(options: DownloadCallOptions, response: IncomingMessage) {
  if (!checkSha2(safeGetHeader(response, "X-Checksum-Sha2"), options.options.sha2, options.callback)) {
    return
  }

  const streams: Array<any> = []
  if (options.options.onProgress != null) {
    const contentLength = safeGetHeader(response, "content-length")
    if (contentLength != null) {
      streams.push(new ProgressCallbackTransform(parseInt(contentLength, 10), options.options.cancellationToken, options.options.onProgress))
    }
  }

  const sha512 = options.options.sha512
  if (sha512 != null) {
    streams.push(new DigestTransform(sha512, "sha512", sha512.length === 128 && !sha512.includes("+") && !sha512.includes("Z") && !sha512.includes("=") ? "hex" : "base64"))
  }
  else if (options.options.sha2 != null) {
    streams.push(new DigestTransform(options.options.sha2, "sha256", "hex"))
  }

  const fileOut = createWriteStream(options.destination!!)
  streams.push(fileOut)

  let lastStream = response
  for (const stream of streams) {
    stream.on("error", (error: Error) => {
      if (!options.options.cancellationToken.cancelled) {
        options.callback(error)
      }
    })
    lastStream = lastStream.pipe(stream)
  }

  fileOut.on("finish", () => {
    (fileOut.close as any)(options.callback)
  })
}

export function configureRequestOptions(options: RequestOptions, token?: string | null, method?: "GET" | "DELETE" | "PUT"): RequestOptions {
  if (method != null) {
    options.method = method
  }

  options.headers = {...options.headers}
  const headers = options.headers

  if (token != null) {
    (headers as any).authorization = token.startsWith("Basic") ? token : `token ${token}`
  }
  if (headers["User-Agent"] == null) {
    headers["User-Agent"] = "electron-builder"
  }

  if ((method == null || method === "GET") || headers["Cache-Control"] == null) {
    headers["Cache-Control"] = "no-cache"
  }

  // do not specify for node (in any case we use https module)
  if (options.protocol == null && (process.versions as any).electron != null) {
    options.protocol = "https:"
  }
  return options
}

export function safeStringifyJson(data: any, skippedNames?: Set<string>) {
  return JSON.stringify(data, (name, value) => {
    if (name.endsWith("authorization") || name.endsWith("Password") || name.endsWith("PASSWORD") || name.endsWith("Token") || name.includes("password") || name.includes("token") || (skippedNames != null && skippedNames.has(name))) {
      return "<stripped sensitive data>"
    }
    return value
  }, 2)
}