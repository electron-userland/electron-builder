import { HttpExecutor } from "builder-util-runtime"
import { ClientRequest, request as httpRequest } from "http"
import { HttpProxyAgent } from "http-proxy-agent"
import * as https from "https"
import { HttpsProxyAgent } from "https-proxy-agent"
import { isEmptyOrSpaces } from "./stringUtil.js"

export class NodeHttpExecutor extends HttpExecutor<ClientRequest> {
  // noinspection JSMethodCanBeStatic
  // noinspection JSUnusedGlobalSymbols
  createRequest(options: any, callback: (response: any) => void): ClientRequest {
    if (options.protocol === "https:") {
      const proxy = getProxyEnv("HTTPS_PROXY", "https_proxy")
      if (proxy != null) {
        options.agent = new HttpsProxyAgent(proxy)
      }
    } else if (options.protocol === "http:") {
      const proxy = getProxyEnv("HTTP_PROXY", "http_proxy")
      if (proxy != null) {
        options.agent = new HttpProxyAgent(proxy)
      }
    }
    return (options.protocol === "http:" ? httpRequest : https.request)(options, callback)
  }
}

export const httpExecutor = new NodeHttpExecutor()

function getProxyEnv(uppercaseName: "HTTP_PROXY" | "HTTPS_PROXY", lowercaseName: "http_proxy" | "https_proxy"): string | undefined {
  return [process.env[uppercaseName], process.env[lowercaseName]].find(value => !isEmptyOrSpaces(value))
}

export function buildGotProxyAgent(): { http?: HttpProxyAgent<string>; https?: HttpsProxyAgent<string> } | undefined {
  const httpsProxy = getProxyEnv("HTTPS_PROXY", "https_proxy")
  const httpProxy = getProxyEnv("HTTP_PROXY", "http_proxy")
  if (!httpsProxy && !httpProxy) {
    return undefined
  }
  return {
    ...(httpProxy ? { http: new HttpProxyAgent(httpProxy) } : {}),
    ...(httpsProxy ? { https: new HttpsProxyAgent(httpsProxy) } : {}),
  }
}
