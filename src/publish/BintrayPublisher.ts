import { Publisher, PublishOptions } from "./publisher"
import { Promise as BluebirdPromise } from "bluebird"
import { bintrayRequest, HttpError, doApiRequest, uploadFile } from "./gitHubRequest"
import { log } from "../util/log"
import { debug } from "../util/util"
import { basename } from "path"
import { stat } from "fs-extra-p"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter")

//noinspection ReservedWordAsName
interface Version {
  readonly name: string
  readonly package: string
}

export class BintrayPublisher implements Publisher {
  private _versionPromise: BluebirdPromise<Version>
  private readonly auth: string

  private basePath: string

  constructor(private user: string, apiKey: string, private version: string, private packageName: string, private repo: string = "generic", private options: PublishOptions = {}) {
    this.auth = `Basic ${new Buffer(`${user}:${apiKey}`).toString("base64")}`
    this.basePath = `/packages/${this.user}/${this.repo}/${this.packageName}`
    this._versionPromise = <BluebirdPromise<Version>>this.init()
  }

  private async init(): Promise<Version | null> {
    try {
      return await bintrayRequest<Version>(`${this.basePath}/versions/${this.version}`, this.auth)
    }
    catch (e) {
      if (e instanceof HttpError && e.response.statusCode === 404) {
        if (this.options.publish !== "onTagOrDraft") {
          log(`Version ${this.version} doesn't exist, creating one`)
          return this.createVersion()
        }
        else {
          log(`Version ${this.version} doesn't exist, artifacts will be not published`)
        }
      }

      throw e
    }
  }

  private createVersion() {
    return bintrayRequest<Version>(`${this.basePath}/versions`, this.auth, {
      name: this.version,
    })
  }

  async upload(file: string, artifactName?: string): Promise<any> {
    const fileName = artifactName || basename(file)
    const version = await this._versionPromise
    if (version == null) {
      debug(`Version ${this.version} doesn't exist and is not created, artifact ${fileName} is not published`)
      return
    }

    const fileStat = await stat(file)
    let badGatewayCount = 0
    for (let i = 0; i < 3; i++) {
      try {
        return await doApiRequest<any>({
          hostname: "api.bintray.com",
          path: `/content/${this.user}/${this.repo}/${this.packageName}/${version.name}/${fileName}`,
          method: "PUT",
          headers: {
            "User-Agent": "electron-builder",
            "Content-Length": fileStat.size,
            "X-Bintray-Override": "1",
            "X-Bintray-Publish": "1",
          }
        }, this.auth, uploadFile.bind(this, file, fileStat, fileName))
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
    if (version == null) {
      return BluebirdPromise.resolve()
    }

    return bintrayRequest<Version>(`/packages/${this.user}/${this.repo}/${this.packageName}/versions/${version.name}`, this.auth, null, "DELETE")
  }
}