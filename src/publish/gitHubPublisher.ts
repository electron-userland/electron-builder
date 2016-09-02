import { isEmptyOrSpaces } from "../util/util"
import { log, warn } from "../util/log"
import { debug } from "../util/util"
import { basename } from "path"
import { parse as parseUrl } from "url"
import * as mime from "mime"
import { stat } from "fs-extra-p"
import { githubRequest, HttpError, doApiRequest } from "./restApiRequest"
import { Promise as BluebirdPromise } from "bluebird"
import { PublishPolicy, PublishOptions, Publisher } from "./publisher"
import { uploadFile } from "./uploader"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("../util/awaiter")

export interface Release {
  id: number
  tag_name: string

  draft: boolean

  upload_url: string
}

interface Asset {
  id: number
  name: string
}

export class GitHubPublisher implements Publisher {
  private tag: string
  private _releasePromise: BluebirdPromise<Release>

  private readonly token: string
  private readonly policy: PublishPolicy

  get releasePromise(): Promise<Release | null> {
    return this._releasePromise
  }

  constructor(private owner: string, private repo: string, private version: string, private options: PublishOptions, private isPublishOptionGuessed: boolean = false) {
    if (isEmptyOrSpaces(options.githubToken)) {
      throw new Error("GitHub Personal Access Token is not specified")
    }

    this.token = options.githubToken!
    this.policy = options.publish || "always"

    if (version.startsWith("v")) {
      throw new Error(`Version must not starts with "v": ${version}`)
    }

    this.tag = `v${version}`
    this._releasePromise = this.token === "__test__" ? BluebirdPromise.resolve(<any>null) : <BluebirdPromise<Release>>this.init()
  }

  private async init(): Promise<Release | null> {
    const createReleaseIfNotExists = this.policy !== "onTagOrDraft"
    // we don't use "Get a release by tag name" because "tag name" means existing git tag, but we draft release and don't create git tag
    const releases = await githubRequest<Array<Release>>(`/repos/${this.owner}/${this.repo}/releases`, this.token)
    for (let release of releases) {
      if (release.tag_name === this.tag) {
        if (release.draft) {
          return release
        }

        if (!this.isPublishOptionGuessed && this.policy === "onTag") {
          throw new Error(`Release with tag ${this.tag} must be a draft`)
        }

        const message = `Release with tag ${this.tag} is not a draft, artifacts will be not published`
        if (this.isPublishOptionGuessed || this.policy === "onTagOrDraft") {
          log(message)
        }
        else {
          warn(message)
        }
        return null
      }
      else if (release.tag_name === this.version) {
        throw new Error(`Tag name must starts with "v": ${release.tag_name}`)
      }
    }

    if (createReleaseIfNotExists) {
      log(`Release with tag ${this.tag} doesn't exist, creating one`)
      return this.createRelease()
    }
    else {
      log(`Release with tag ${this.tag} doesn't exist, artifacts will be not published`)
      return null
    }
  }

  async upload(file: string, artifactName?: string): Promise<void> {
    const fileName = artifactName || basename(file)
    const release = await this.releasePromise
    if (release == null) {
      debug(`Release with tag ${this.tag} doesn't exist and is not created, artifact ${fileName} is not published`)
      return
    }

    const parsedUrl = parseUrl(release.upload_url.substring(0, release.upload_url.indexOf("{")) + "?name=" + fileName)
    const fileStat = await stat(file)
    let badGatewayCount = 0
    uploadAttempt: for (let i = 0; i < 3; i++) {
      try {
        return await doApiRequest<any>({
          hostname: parsedUrl.hostname,
          path: parsedUrl.path,
          method: "POST",
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "electron-builder",
            "Content-Type": mime.lookup(fileName),
            "Content-Length": fileStat.size
          }
        }, this.token, uploadFile.bind(this, file, fileStat, fileName))
      }
      catch (e) {
        if (e instanceof HttpError) {
          if (e.response.statusCode === 422 && e.description != null && e.description.errors != null && e.description.errors[0].code === "already_exists") {
            // delete old artifact and re-upload
            log(`Artifact ${fileName} already exists, overwrite one`)
            const assets = await githubRequest<Array<Asset>>(`/repos/${this.owner}/${this.repo}/releases/${release.id}/assets`, this.token)
            for (let asset of assets) {
              if (asset!.name === fileName) {
                await githubRequest<void>(`/repos/${this.owner}/${this.repo}/releases/assets/${asset!.id}`, this.token, null, "DELETE")
                continue uploadAttempt
              }
            }

            log(`Artifact ${fileName} not found, trying to upload again`)
            continue
          }
          else if (e.response.statusCode === 502 && badGatewayCount++ < 3) {
            continue
          }
        }

        throw e
      }
    }
  }

  private createRelease() {
    return githubRequest<Release>(`/repos/${this.owner}/${this.repo}/releases`, this.token, {
      tag_name: this.tag,
      name: this.version,
      draft: this.options.draft == null || this.options.draft,
      prerelease: this.options.prerelease != null && this.options.prerelease,
    })
  }

  // test only
  //noinspection JSUnusedGlobalSymbols
  async getRelease(): Promise<any> {
    return githubRequest<Release>(`/repos/${this.owner}/${this.repo}/releases/${this._releasePromise.value().id}`, this.token)
  }

  //noinspection JSUnusedGlobalSymbols
  async deleteRelease(): Promise<any> {
    if (!this._releasePromise.isFulfilled()) {
      return
    }

    const release = this._releasePromise.value()
    if (release == null) {
      return
    }

    for (let i = 0; i < 3; i++) {
      try {
        return await githubRequest(`/repos/${this.owner}/${this.repo}/releases/${release.id}`, this.token, null, "DELETE")
      }
      catch (e) {
        if (e instanceof HttpError && (e.response.statusCode === 405 || e.response.statusCode === 502)) {
          continue
        }

        throw e
      }
    }

    warn(`Cannot delete release ${release.id}`)
  }

  // async deleteOldReleases() {
  //   const releases = await githubRequest<Array<Release>>(`/repos/${this.owner}/${this.repo}/releases`, this.token)
  //   for (let release of releases) {
  //     await githubRequest(`/repos/${this.owner}/${this.repo}/releases/${release.id}`, this.token, null, "DELETE")
  //   }
  // }
}