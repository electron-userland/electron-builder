import * as https from "https"
import { RequestOptions } from "https"
import { IncomingMessage, ClientRequest } from "http"
import { addTimeOutHandler } from "../util/httpRequest"
import { Promise as BluebirdPromise } from "bluebird"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter")

export function githubRequest<T>(path: string, token: string | null, data: { [name: string]: any; } | null = null, method: string = "GET"): BluebirdPromise<T> {
  return request<T>("api.github.com", path, token, data, method)
}

export function bintrayRequest<T>(path: string, auth: string | null, data: { [name: string]: any; } | null = null, method: string = "GET"): BluebirdPromise<T> {
  return request<T>("api.bintray.com", path, auth, data, method)
}

function request<T>(hostname: string, path: string, token: string | null, data: { [name: string]: any; } | null = null, method: string = "GET"): BluebirdPromise<T> {
  const options: any = {
    hostname: hostname,
    path: path,
    method: method,
    headers: {
      "User-Agent": "electron-builder"
    }
  }

  if (hostname.includes("github")) {
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

export function doApiRequest<T>(options: RequestOptions, token: string | null, requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void): BluebirdPromise<T> {
  if (token != null) {
    (<any>options.headers).authorization = token.startsWith("Basic") ? token : `token ${token}`
  }

  return new BluebirdPromise<T>((resolve, reject, onCancel) => {
    const request = https.request(options, (response: IncomingMessage) => {
      try {
        if (response.statusCode === 404) {
          // error is clear, we don't need to read detailed error description
          reject(new HttpError(response, `method: ${options.method} url: https://${options.hostname}${options.path}

Please double check that your GitHub Token is correct. Due to security reasons GitHub doesn't report actual status, but 404.
`))
        }
        else if (response.statusCode === 204) {
          // on DELETE request
          resolve()
          return
        }

        let data = ""
        response.setEncoding("utf8")
        response.on("data", (chunk: string) => {
          data += chunk
        })

        response.on("end", () => {
          try {
            if (response.statusCode >= 400) {
              const contentType = response.headers["content-type"]
              if (contentType != null && contentType.includes("json")) {
                reject(new HttpError(response, JSON.parse(data)))
              }
              else {
                reject(new HttpError(response))
              }
            }
            else {
              resolve(data.length === 0 ? null : JSON.parse(data))
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