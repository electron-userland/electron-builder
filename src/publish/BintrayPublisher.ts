import { Publisher, PublishOptions } from "./publisher"
import BluebirdPromise from "bluebird-lst-c"
import { HttpError, doApiRequest } from "./restApiRequest"
import { uploadFile } from "./uploader"
import { log } from "../util/log"
import { debug, isEmptyOrSpaces } from "../util/util"
import { basename } from "path"
import { stat } from "fs-extra-p"
import { BintrayClient, Version } from "./bintray"
import { BintrayOptions } from "../options/publishOptions"

export class BintrayPublisher implements Publisher {
  private _versionPromise: BluebirdPromise<Version>

  private readonly client: BintrayClient

  constructor(private readonly info: BintrayOptions, private readonly version: string, private readonly options: PublishOptions = {}) {
    let token = info.token
    if (isEmptyOrSpaces(token)) {
      token = process.env.BT_TOKEN
      if (isEmptyOrSpaces(token)) {
        throw new Error(`Bintray token is not set, neither programmatically, nor using env "BT_TOKEN"`)
      }
    }

    this.client = new BintrayClient(info.owner!, info.package!, info.repo, token, info.user!)
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
          path: `/content/${this.client.owner}/${this.client.repo}/${this.client.packageName}/${version.name}/${fileName}`,
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