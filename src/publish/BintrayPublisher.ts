import { Publisher, PublishOptions } from "./publisher"
import BluebirdPromise from "bluebird-lst-c"
import { log } from "../util/log"
import { debug, isEmptyOrSpaces } from "../util/util"
import { BintrayClient, Version } from "./bintray"
import { BintrayOptions } from "../options/publishOptions"
import { ClientRequest } from "http"
import { NodeHttpExecutor } from "../util/nodeHttpExecutor"
import { HttpError } from "../util/httpExecutor"

export class BintrayPublisher extends Publisher {
  private _versionPromise: BluebirdPromise<Version>
  private readonly httpExecutor: NodeHttpExecutor = new NodeHttpExecutor()

  private readonly client: BintrayClient

  constructor(info: BintrayOptions, private readonly version: string, private readonly options: PublishOptions = {}) {
    super()

    let token = info.token
    if (isEmptyOrSpaces(token)) {
      token = process.env.BT_TOKEN
      if (isEmptyOrSpaces(token)) {
        throw new Error(`Bintray token is not set, neither programmatically, nor using env "BT_TOKEN"`)
      }
    }

    this.client = new BintrayClient(info, token)
    this._versionPromise = <BluebirdPromise<Version>>this.init()
  }

  private async init(): Promise<Version | null> {
    try {
      return await this.client.getVersion(this.version)
    }
    catch (e) {
      if (e instanceof HttpError && e.response.statusCode === 404) {
        if (this.options.publish !== "onTagOrDraft") {
          log(`Version ${this.version} doesn't exist, creating one`)
          return this.client.createVersion(this.version)
        }
        else {
          log(`Version ${this.version} doesn't exist, artifacts will be not published`)
        }
      }

      throw e
    }
  }

  protected async doUpload(fileName: string, dataLength: number, requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void) {
    const version = await this._versionPromise
    if (version == null) {
      debug(`Version ${this.version} doesn't exist and is not created, artifact ${fileName} is not published`)
      return
    }

    let badGatewayCount = 0
    for (let i = 0; i < 3; i++) {
      try {
        return await this.httpExecutor.doApiRequest<any>({
          hostname: "api.bintray.com",
          path: `/content/${this.client.owner}/${this.client.repo}/${this.client.packageName}/${version.name}/${fileName}`,
          method: "PUT",
          headers: {
            "User-Agent": "electron-builder",
            "Content-Length": dataLength,
            "X-Bintray-Override": "1",
            "X-Bintray-Publish": "1",
          }
        }, this.client.auth, requestProcessor)
      }
      catch (e) {
        if (e instanceof HttpError && e.response.statusCode === 502 && badGatewayCount++ < 3) {
          continue
        }

        throw e
      }
    }
  }

  //noinspection JSUnusedGlobalSymbols
  deleteRelease(): Promise<any> {
    if (!this._versionPromise.isFulfilled()) {
      return BluebirdPromise.resolve()
    }

    const version = this._versionPromise.value()
    return version == null ? BluebirdPromise.resolve() : this.client.deleteVersion(version.name)
  }
}