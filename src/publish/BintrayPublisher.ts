import { Publisher, PublishOptions } from "./publisher"
import { Promise as BluebirdPromise } from "bluebird"
import { HttpError, doApiRequest } from "./restApiRequest"
import { uploadFile } from "./uploader"
import { log } from "../util/log"
import { debug } from "../util/util"
import { basename } from "path"
import { stat } from "fs-extra-p"
import { BintrayClient, Version } from "./bintray"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter")

export class BintrayPublisher implements Publisher {
  private _versionPromise: BluebirdPromise<Version>

  private readonly client: BintrayClient

  constructor(private user: string, apiKey: string, private version: string, private packageName: string, private repo: string = "generic", private options: PublishOptions = {}) {
    this.client = new BintrayClient(user, packageName, repo, apiKey)
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
        }, this.client.auth, uploadFile.bind(this, file, fileStat, fileName))
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