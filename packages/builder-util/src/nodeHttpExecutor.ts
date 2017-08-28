import _debug from "debug"
import { CancellationToken, configureRequestOptions, configureRequestOptionsFromUrl, DownloadOptions, HttpExecutor } from "electron-builder-http"
import { ensureDir, readFile } from "fs-extra-p"
import { Agent, ClientRequest, IncomingMessage, request as httpRequest, RequestOptions } from "http"
import * as https from "https"
import { parse as parseIni } from "ini"
import { homedir } from "os"
import * as path from "path"
import { parse as parseUrl } from "url"
import { safeStringifyJson } from "./util"

const debug = _debug("electron-builder")

export class NodeHttpExecutor extends HttpExecutor<ClientRequest> {
  private httpsAgentPromise: Promise<Agent> | null

  async download(url: string, destination: string, options: DownloadOptions = {cancellationToken: new CancellationToken()}): Promise<string> {
    if (!options.skipDirCreation) {
      await ensureDir(path.dirname(destination))
    }

    if (this.httpsAgentPromise == null) {
      this.httpsAgentPromise = createAgent()
    }

    const agent = await this.httpsAgentPromise
    return await options.cancellationToken.createPromise<string>((resolve, reject, onCancel) => {
      this.doDownload(configureRequestOptions(configureRequestOptionsFromUrl(url, {
        headers: options.headers || undefined,
        agent,
      })), destination, 0, options, (error: Error) => {
        if (error == null) {
          resolve(destination)
        }
        else {
          reject(error)
        }
      }, onCancel)
    })
  }

  doApiRequest<T>(options: RequestOptions, cancellationToken: CancellationToken, requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void, redirectCount: number = 0): Promise<T> {
    if (debug.enabled) {
      debug(`HTTP request: ${safeStringifyJson(options)}`)
    }

    return cancellationToken.createPromise((resolve, reject, onCancel) => {
      const request = this.doRequest(options, (response: IncomingMessage) => {
        try {
          this.handleResponse(response, options, cancellationToken, resolve, reject, redirectCount, requestProcessor)
        }
        catch (e) {
          reject(e)
        }
      })

      this.addTimeOutHandler(request, reject)
      request.on("error", reject)
      requestProcessor(request, reject)
      onCancel(() => request.abort())
    })
  }

  protected doRequest(options: any, callback: (response: any) => void): any {
    return (options.protocol === "http:" ? httpRequest : https.request)(options, callback)
  }
}

export const httpExecutor: NodeHttpExecutor = new NodeHttpExecutor()

// only https proxy
async function proxyFromNpm() {
  let data = ""
  try {
    data = await readFile(path.join(homedir(), ".npmrc"), "utf-8")
  }
  catch (ignored) {
    return null
  }

  if (!data) {
    return null
  }

  try {
    const config = parseIni(data)
    return config["https-proxy"] || config.proxy
  }
  catch (e) {
    // used in nsis auto-updater, do not use .util.warn here
    console.warn(e)
    return null
  }
}

// only https url
async function createAgent() {
  let proxyString = process.env.npm_config_https_proxy || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.npm_config_proxy
  if (!proxyString) {
    proxyString = await proxyFromNpm()
    if (!proxyString) {
      return null
    }
  }

  const proxy = parseUrl(proxyString)

  const proxyProtocol = proxy.protocol === "https:" ? "Https" : "Http"
  return require("tunnel-agent")[`httpsOver${proxyProtocol}`]({
    proxy: {
      port: proxy.port || (proxyProtocol === "Https" ? 443 : 80),
      host: proxy.hostname,
      proxyAuth: proxy.auth
    }
  })
}