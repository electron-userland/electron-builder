import * as https from "https"
import { RequestOptions } from "https"
import { IncomingMessage, ClientRequest } from "http"
import { addTimeOutHandler } from "../util/httpRequest"
import BluebirdPromise from "bluebird-lst-c"
import { Url } from "url"
import { safeLoad } from "js-yaml"
import _debug from "debug"
import Debugger = debug.Debugger
import { parse as parseUrl } from "url"

const debug: Debugger = _debug("electron-builder")

export function githubRequest<T>(path: string, token: string | null, data: { [name: string]: any; } | null = null, method: string = "GET"): Promise<T> {
  return request<T>({hostname: "api.github.com", path: path}, token, data, method)
}

export function bintrayRequest<T>(path: string, auth: string | null, data: { [name: string]: any; } | null = null, method: string = "GET"): Promise<T> {
  return request<T>({hostname: "api.bintray.com", path: path}, auth, data, method)
}

export function request<T>(url: Url, token: string | null = null, data: { [name: string]: any; } | null = null, method: string = "GET"): Promise<T> {
  const options: any = Object.assign({
    method: method,
    headers: {
      "User-Agent": "electron-builder"
    }
  }, url)

  if (url.hostname!!.includes("github") && !url.path!.endsWith(".yml")) {
    options.headers.Accept = "application/vnd.github.v3+json"
  }

  const encodedData = data == null ? null : new Buffer(JSON.stringify(data))
  if (encodedData != null) {
    options.method = "post"
    options.headers["Content-Type"] = "application/json"
    options.headers["Content-Length"] = encodedData.length
  }
  return doApiRequest<T>(options, token, it => it.end(encodedData))
}

export function doApiRequest<T>(options: RequestOptions, token: string | null, requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void, redirectCount: number = 0): Promise<T> {
  debug(`HTTPS request: ${JSON.stringify(options, null, 2)}`)

  if (token != null) {
    (<any>options.headers).authorization = token.startsWith("Basic") ? token : `token ${token}`
  }

  return new BluebirdPromise<T>((resolve, reject, onCancel) => {
    const request = https.request(options, (response: IncomingMessage) => {
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

        const redirectUrl = response.headers.location
        if (redirectUrl != null) {
          if (redirectCount > 10) {
            reject(new Error("Too many redirects (> 10)"))
            return
          }

          if (options.path!.endsWith("/latest")) {
            resolve(<any>{location: redirectUrl})
          }
          else {
            doApiRequest(Object.assign({}, options, parseUrl(redirectUrl)), token, requestProcessor)
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
    addTimeOutHandler(request, reject)
    request.on("error", reject)
    requestProcessor(request, reject)
    onCancel!(() => request.abort())
  })
}

export class HttpError extends Error {
  constructor(public response: IncomingMessage, public description: any = null) {
    super(response.statusCode + " " + response.statusMessage + (description == null ? "" : ("\n" + JSON.stringify(description, <any>null, "  "))) + "\nHeaders: " + JSON.stringify(response.headers, <any>null, "  "))
  }
}