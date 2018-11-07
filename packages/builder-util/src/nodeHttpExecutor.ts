import { HttpExecutor } from "builder-util-runtime"
import { ClientRequest, request as httpRequest } from "http"
import * as https from "https"

export class NodeHttpExecutor extends HttpExecutor<ClientRequest> {
  // noinspection JSMethodCanBeStatic
  // noinspection JSUnusedGlobalSymbols
  createRequest(options: any, callback: (response: any) => void): any {
    return (options.protocol === "http:" ? httpRequest : https.request)(options, callback)
  }
}

export const httpExecutor = new NodeHttpExecutor()