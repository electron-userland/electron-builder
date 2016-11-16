import { isEmptyOrSpaces } from "../util/util"
import { log, warn } from "../util/log"
import { debug } from "../util/util"
import { parse as parseUrl } from "url"
import mime from "mime"
import { githubRequest, HttpError, doApiRequest } from "./restApiRequest"
import BluebirdPromise from "bluebird-lst-c"
import { PublishPolicy, PublishOptions, Publisher } from "./publisher"
import { GithubOptions } from "../options/publishOptions"
import { ClientRequest } from "http"

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

export class GitHubPublisher extends Publisher {
  private tag: string
  private _releasePromise: Promise<Release>

  private readonly token: string
  private readonly policy: PublishPolicy

  get releasePromise(): Promise<Release | null> {
    return this._releasePromise
  }

  constructor(private readonly info: GithubOptions, private readonly version: string, private readonly options: PublishOptions = {}, private readonly isPublishOptionGuessed: boolean = false) {
    super()

    let token = info.token
    if (isEmptyOrSpaces(token)) {
      token = process.env.GH_TOKEN
      if (isEmptyOrSpaces(token)) {
        throw new Error(`GitHub Personal Access Token is not set, neither programmatically, nor using env "GH_TOKEN"`)
      }
    }

    this.token = token!
    this.options = options || {}
    this.policy = this.options.publish || "always"

    if (version.startsWith("v")) {
      throw new Error(`Version must not starts with "v": ${version}`)
    }

    this.tag = info.vPrefixedTagName === false ? version : `v${version}`
    this._releasePromise = this.token === "__test__" ? BluebirdPromise.resolve(<any>null) : this.init()
  }

  private async init(): Promise<Release | null> {
    const createReleaseIfNotExists = this.policy !== "onTagOrDraft"
    // we don't use "Get a release by tag name" because "tag name" means existing git tag, but we draft release and don't create git tag
    const releases = await githubRequest<Array<Release>>(`/repos/${this.info.owner}/${this.info.repo}/releases`, this.token)
    for (let release of releases) {
      if (release.tag_name === this.tag || release.tag_name === this.version) {
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

  protected async doUpload(fileName: string, dataLength: number, requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void): Promise<void> {
    const release = await this.releasePromise
    if (release == null) {
      debug(`Release with tag ${this.tag} doesn't exist and is not created, artifact ${fileName} is not published`)
      return
    }

    const parsedUrl = parseUrl(release.upload_url.substring(0, release.upload_url.indexOf("{")) + "?name=" + fileName)
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
            "Content-Length": dataLength
          }
        }, this.token, requestProcessor)
      }
      catch (e) {
        if (e instanceof HttpError) {
          if (e.response.statusCode === 422 && e.description != null && e.description.errors != null && e.description.errors[0].code === "already_exists") {
            // delete old artifact and re-upload
            log(`Artifact ${fileName} already exists, overwrite one`)
            const assets = await githubRequest<Array<Asset>>(`/repos/${this.info.owner}/${this.info.repo}/releases/${release.id}/assets`, this.token)
            for (let asset of assets) {
              if (asset!.name === fileName) {
                await githubRequest<void>(`/repos/${this.info.owner}/${this.info.repo}/releases/assets/${asset!.id}`, this.token, null, "DELETE")
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
    return githubRequest<Release>(`/repos/${this.info.owner}/${this.info.repo}/releases`, this.token, {
      tag_name: this.tag,
      name: this.version,
      draft: this.options.draft == null || this.options.draft,
      prerelease: this.options.prerelease != null && this.options.prerelease,
    })
  }

  // test only
  //noinspection JSUnusedGlobalSymbols
  async getRelease(): Promise<any> {
    return githubRequest<Release>(`/repos/${this.info.owner}/${this.info.repo}/releases/${(await this._releasePromise).id}`, this.token)
  }

  //noinspection JSUnusedGlobalSymbols
  async deleteRelease(): Promise<any> {
    const release = await this._releasePromise
    if (release == null) {
      return
    }

    for (let i = 0; i < 3; i++) {
      try {
        return await githubRequest(`/repos/${this.info.owner}/${this.info.repo}/releases/${release.id}`, this.token, null, "DELETE")
      }
      catch (e) {
        if (e instanceof HttpError) {
          if (e.response.statusCode === 404) {
            warn(`Cannot delete release ${release.id} — doesn't exist`)
            return
          }
          else if (e.response.statusCode === 405 || e.response.statusCode === 502) {
            continue
          }
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