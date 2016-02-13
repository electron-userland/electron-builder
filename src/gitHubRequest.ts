import * as https from "https"
import { RequestOptions } from "https"
import { IncomingMessage, ClientRequest } from "http"
import { addTimeOutHandler } from "./httpRequest"
import { Promise as BluebirdPromise } from "bluebird"
import { tsAwaiter } from "./awaiter"

const __awaiter = tsAwaiter
Array.isArray(__awaiter)

export function gitHubRequest<T>(path: string, token: string, data: { [name: string]: any; } = null, method: string = "GET"): BluebirdPromise<T> {
  const options: any = {
    hostname: "api.github.com",
    path: path,
    method: method,
    headers: {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "electron-complete-builder",
    }
  }

  const encodedData = data == null ? null : new Buffer(JSON.stringify(data))
  if (encodedData != null) {
    options.method = "post"
    options.headers["Content-Type"] = "application/json"
    options.headers["Content-Length"] = encodedData.length
  }
  return doGitHubRequest<T>(options, token, it => it.end(encodedData))
}

export function doGitHubRequest<T>(options: RequestOptions, token: string, requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void): BluebirdPromise<T> {
  if (token != null) {
    (<any>options.headers).authorization = "token " + token
  }

  return new BluebirdPromise<T>((resolve, reject, onCancel) => {
    const request = https.request(options, (response: IncomingMessage) => {
      try {
        if (response.statusCode === 404) {
          // error is clear, we don't need to read detailed error description
          reject(new HttpError(response))
          return
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
              if (response.headers["content-type"].includes("json")) {
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
    onCancel(() => request.abort())
  })
}

export class HttpError extends Error {
  constructor(public response: IncomingMessage, public description: any = null) {
    super(response.statusCode + " " + response.statusMessage + (description == null ? "" : ("\n" + JSON.stringify(description, null, "  "))) + "\nHeaders: " + JSON.stringify(response.headers, null, "  "))
  }
}