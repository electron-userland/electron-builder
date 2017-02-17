import BluebirdPromise from "bluebird-lst"
import { configureRequestOptions, HttpError } from "electron-builder-http"
import { BintrayClient, Version } from "electron-builder-http/out/bintray"
import { BintrayOptions } from "electron-builder-http/out/publishOptions"
import { debug, isEmptyOrSpaces } from "electron-builder-util"
import { log } from "electron-builder-util/out/log"
import { httpExecutor } from "electron-builder-util/out/nodeHttpExecutor"
import { ClientRequest } from "http"
import { HttpPublisher, PublishContext, PublishOptions } from "./publisher"

export class BintrayPublisher extends HttpPublisher {
  private _versionPromise: BluebirdPromise<Version>

  private readonly client: BintrayClient

  readonly providerName = "Bintray"

  constructor(context: PublishContext, info: BintrayOptions, private readonly version: string, private readonly options: PublishOptions = {}) {
    super(context)

    let token = info.token
    if (isEmptyOrSpaces(token)) {
      token = process.env.BT_TOKEN
      if (isEmptyOrSpaces(token)) {
        throw new Error(`Bintray token is not set, neither programmatically, nor using env "BT_TOKEN"`)
      }
    }

    this.client = new BintrayClient(info, this.context.cancellationToken, token)
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
        return await httpExecutor.doApiRequest<any>(configureRequestOptions({
          hostname: "api.bintray.com",
          path: `/content/${this.client.owner}/${this.client.repo}/${this.client.packageName}/${version.name}/${fileName}`,
          method: "PUT",
          headers: {
            "Content-Length": dataLength,
            "X-Bintray-Override": "1",
            "X-Bintray-Publish": "1",
          }
        }, this.client.auth), this.context.cancellationToken, requestProcessor)
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

  toString() {
    return `Bintray (user: ${this.client.user || this.client.owner}, owner: ${this.client.owner},  package: ${this.client.packageName}, repository: ${this.client.repo}, version: ${this.version})`
  }
}