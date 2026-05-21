import { HttpExecutor } from "builder-util-runtime"
import { ClientRequest, request as httpRequest } from "http"
import { HttpProxyAgent } from "http-proxy-agent"
import * as https from "https"
import { HttpsProxyAgent } from "https-proxy-agent"
import { isEmptyOrSpaces } from "./util"

export class NodeHttpExecutor extends HttpExecutor<ClientRequest> {
  // noinspection JSMethodCanBeStatic
  // noinspection JSUnusedGlobalSymbols
  createRequest(options: any, callback: (response: any) => void): ClientRequest {
    if (process.env["https_proxy"] !== undefined && options.protocol === "https:") {
      options.agent = new HttpsProxyAgent(process.env["https_proxy"])
    } else if (process.env["http_proxy"] !== undefined && options.protocol === "http:") {
      options.agent = new HttpProxyAgent(process.env["http_proxy"])
    }
    return (options.protocol === "http:" ? httpRequest : https.request)(options, callback)
  }
}

export const httpExecutor = new NodeHttpExecutor()

export function buildGotProxyAgent(): { http?: HttpProxyAgent<string>; https?: HttpsProxyAgent<string> } | undefined {
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy
  const isHttpProxyEmpty = isEmptyOrSpaces(httpProxy)
  const isHttpsProxyEmpty = isEmptyOrSpaces(httpsProxy)
  if (isHttpProxyEmpty && isHttpsProxyEmpty) {
    return undefined
  }
  return {
    ...(!isHttpProxyEmpty ? { http: new HttpProxyAgent(httpProxy) } : {}),
    ...(!isHttpsProxyEmpty ? { https: new HttpsProxyAgent(httpsProxy) } : {}),
  }
}
