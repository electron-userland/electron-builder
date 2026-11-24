import { CrossOriginHeaderPolicy, HttpExecutor } from "builder-util-runtime"
import { createDefaultCrossOriginHeaderPolicy } from "builder-util-runtime/internal"
import { ClientRequest, request as httpRequest } from "http"
import { HttpProxyAgent } from "http-proxy-agent"
import * as https from "https"
import { HttpsProxyAgent } from "https-proxy-agent"
import { log } from "./log.js"
import { isEmptyOrSpaces } from "./stringUtil.js"

const DEFAULT_CROSS_ORIGIN_HEADERS_DOCS = "https://www.electron.build/docs/migration/v27-developer-changes#builder-util-runtime-default-cross-origin-headers"

// builder-util-runtime's default policy, announcing the v27 change: once per process for each set of left-out header names, which it names
// with both origins, never a value
const defaultCrossOriginHeaderPolicy = createDefaultCrossOriginHeaderPolicy((headerNames, hop) => {
  const names = [...headerNames].sort().join(", ")
  log
    .once(`cross-origin-headers-dropped:${names}`)
    .warn(
      `electron-builder v27 sends only the request headers that carry no credential (Accept, Content-Type, Range, User-Agent and the like) on a redirect to another origin, ` +
        `so the redirect from ${hop.from.origin} to ${hop.to.origin} was sent without ${names}; electron-builder v26 sent every header there but Authorization, Cookie and a few other credential headers. ` +
        `If ${hop.to.origin} needs one of them, send the request to it yourself with that header, or pass a crossOriginHeaderPolicy to the executor's constructor. See ${DEFAULT_CROSS_ORIGIN_HEADERS_DOCS}`
    )
})

export class NodeHttpExecutor extends HttpExecutor<ClientRequest> {
  /**
   * @param crossOriginHeaderPolicy see {@link HttpExecutor}; by default builder-util-runtime's, which sends only the headers that carry no
   * credential on a redirect to another origin, and here logs a warning naming the ones it leaves out
   */
  constructor(crossOriginHeaderPolicy: CrossOriginHeaderPolicy = defaultCrossOriginHeaderPolicy) {
    super(crossOriginHeaderPolicy)
  }

  // noinspection JSMethodCanBeStatic
  // noinspection JSUnusedGlobalSymbols
  createRequest(options: any, callback: (response: any) => void): ClientRequest {
    if (options.protocol === "https:") {
      const proxy = getProxyEnv("HTTPS_PROXY")
      if (proxy != null) {
        options.agent = new HttpsProxyAgent(proxy)
      }
    } else if (options.protocol === "http:") {
      const proxy = getProxyEnv("HTTP_PROXY")
      if (proxy != null) {
        options.agent = new HttpProxyAgent(proxy)
      }
    }
    return (options.protocol === "http:" ? httpRequest : https.request)(options, callback)
  }
}

export const httpExecutor = new NodeHttpExecutor()

function getProxyEnv(name: "HTTP_PROXY" | "HTTPS_PROXY"): string | undefined {
  return [process.env[name], process.env[name.toLowerCase()]].find(value => !isEmptyOrSpaces(value))
}

export function buildGotProxyAgent(): { http?: HttpProxyAgent<string>; https?: HttpsProxyAgent<string> } | undefined {
  const httpsProxy = getProxyEnv("HTTPS_PROXY")
  const httpProxy = getProxyEnv("HTTP_PROXY")
  if (!httpsProxy && !httpProxy) {
    return undefined
  }
  return {
    ...(httpProxy ? { http: new HttpProxyAgent(httpProxy) } : {}),
    ...(httpsProxy ? { https: new HttpsProxyAgent(httpsProxy) } : {}),
  }
}
