import BluebirdPromise from "bluebird-lst"
import { Arch, debug, isEmptyOrSpaces, isTokenCharValid, log, warn, isEnvTrue } from "builder-util"
import { configureRequestOptions, GithubOptions, HttpError, parseJson } from "builder-util-runtime"
import { httpExecutor } from "builder-util/out/nodeHttpExecutor"
import { ClientRequest } from "http"
import mime from "mime"
import { parse as parseUrl } from "url"
import { getCiTag, HttpPublisher, PublishContext, PublishOptions } from "./publisher"

export interface Release {
  id: number
  tag_name: string

  draft: boolean
  prerelease: boolean

  published_at: string

  upload_url: string
}

interface Asset {
  id: number
  name: string
}

export class GitHubPublisher extends HttpPublisher {
  private tag: string
  private _releasePromise: Promise<Release | null>

  private readonly token: string

  readonly providerName = "GitHub"

  private readonly releaseType: "draft" | "prerelease" | "release"

  /** @private */
  get releasePromise(): Promise<Release | null> {
    if (this._releasePromise == null) {
      this._releasePromise = this.token === "__test__" ? BluebirdPromise.resolve(null as any) : this.getOrCreateRelease()
    }
    return this._releasePromise
  }

  constructor(context: PublishContext, private readonly info: GithubOptions, private readonly version: string, private readonly options: PublishOptions = {}) {
    super(context, true)

    let token = info.token
    if (isEmptyOrSpaces(token)) {
      token = process.env.GH_TOKEN
      if (isEmptyOrSpaces(token)) {
        throw new Error(`GitHub Personal Access Token is not set, neither programmatically, nor using env "GH_TOKEN"`)
      }

      token = token.trim()

      if (!isTokenCharValid(token)) {
        throw new Error(`GitHub Personal Access Token (${JSON.stringify(token)}) contains invalid characters, please check env "GH_TOKEN"`)
      }
    }

    this.token = token!

    if (version.startsWith("v")) {
      throw new Error(`Version must not starts with "v": ${version}`)
    }

    this.tag = info.vPrefixedTagName === false ? version : `v${version}`

    if (isEnvTrue(process.env.EP_DRAFT)) {
      this.releaseType = "draft"
    }
    else if (isEnvTrue(process.env.EP_PRELEASE)) {
      this.releaseType = "prerelease"
    }
    else if (info.releaseType != null) {
      this.releaseType = info.releaseType
    }
    else if ((options as any).prerelease) {
      this.releaseType = "prerelease"
    }
    else {
      this.releaseType = (options as any).draft === false ? "release" : "draft"
    }
  }

  private async getOrCreateRelease(): Promise<Release | null> {
    // we don't use "Get a release by tag name" because "tag name" means existing git tag, but we draft release and don't create git tag
    const releases = await this.githubRequest<Array<Release>>(`/repos/${this.info.owner}/${this.info.repo}/releases`, this.token)
    for (const release of releases) {
      if (!(release.tag_name === this.tag || release.tag_name === this.version)) {
        continue
      }

      if (release.draft) {
        return release
      }

      // https://github.com/electron-userland/electron-builder/issues/1197
      // https://electron-builder.slack.com/archives/general/p1485961449000202
      // https://github.com/electron-userland/electron-builder/issues/2072
      if (this.releaseType === "draft") {
        warn(`Release with tag ${this.tag} already exists`)
        return null
      }

      // https://github.com/electron-userland/electron-builder/issues/1133
      // https://github.com/electron-userland/electron-builder/issues/2074
      // if release created < 2 hours — allow to upload
      const publishedAt = release.published_at == null ? null : Date.parse(release.published_at)
      if (publishedAt != null && (Date.now() - publishedAt) > (2 * 3600 * 1000)) {
        // https://github.com/electron-userland/electron-builder/issues/1183#issuecomment-275867187
        warn(`Release with tag ${this.tag} published at ${new Date(publishedAt).toString()}, more than 2 hours ago`)
        return null
      }
      return release
    }

    // https://github.com/electron-userland/electron-builder/issues/1835
    if (this.options.publish === "always" || getCiTag() != null) {
      log(`Release with tag ${this.tag} doesn't exist, creating one`)
      return this.createRelease()
    }
    return null
  }

  protected async doUpload(fileName: string, arch: Arch, dataLength: number, requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void): Promise<any> {
    const release = await this.releasePromise
    if (release == null) {
      warn(`Release with tag ${this.tag} doesn't exist and is not created, artifact ${fileName} is not published`)
      return
    }

    const parsedUrl = parseUrl(release.upload_url.substring(0, release.upload_url.indexOf("{")) + "?name=" + fileName)
    let attemptNumber = 0
    uploadAttempt: for (let i = 0; i < 3; i++) {
      try {
        return await httpExecutor.doApiRequest(configureRequestOptions({
          hostname: parsedUrl.hostname,
          path: parsedUrl.path,
          method: "POST",
          headers: {
            Accept: "application/vnd.github.v3+json",
            "Content-Type": mime.getType(fileName) || "application/octet-stream",
            "Content-Length": dataLength
          }
        }, this.token), this.context.cancellationToken, requestProcessor)
      }
      catch (e) {
        if (e instanceof HttpError) {
          if (e.response.statusCode === 422 && e.description != null && e.description.errors != null && e.description.errors[0].code === "already_exists") {
            // delete old artifact and re-upload
            debug(`Artifact ${fileName} already exists on GitHub, overwrite one`)

            const assets = await this.githubRequest<Array<Asset>>(`/repos/${this.info.owner}/${this.info.repo}/releases/${release.id}/assets`, this.token, null)
            for (const asset of assets) {
              if (asset!.name === fileName) {
                await this.githubRequest<void>(`/repos/${this.info.owner}/${this.info.repo}/releases/assets/${asset!.id}`, this.token, null, "DELETE")
                continue uploadAttempt
              }
            }

            debug(`Artifact ${fileName} not found on GitHub, trying to upload again`)
            continue
          }
          else if (attemptNumber++ < 3 && e.response.statusCode === 502) {
            continue
          }
        }
        else if (attemptNumber++ < 3 && e.code === "EPIPE") {
          continue
        }

        throw e
      }
    }
  }

  private createRelease() {
    return this.githubRequest<Release>(`/repos/${this.info.owner}/${this.info.repo}/releases`, this.token, {
      tag_name: this.tag,
      name: this.version,
      draft: this.releaseType === "draft",
      prerelease: this.releaseType === "prerelease",
    })
  }

  // test only
  //noinspection JSUnusedGlobalSymbols
  async getRelease(): Promise<any> {
    return this.githubRequest<Release>(`/repos/${this.info.owner}/${this.info.repo}/releases/${(await this._releasePromise)!.id}`, this.token)
  }

  //noinspection JSUnusedGlobalSymbols
  async deleteRelease(): Promise<any> {
    const release = await this._releasePromise
    if (release == null) {
      return
    }

    for (let i = 0; i < 3; i++) {
      try {
        return await this.githubRequest(`/repos/${this.info.owner}/${this.info.repo}/releases/${release.id}`, this.token, null, "DELETE")
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

  private githubRequest<T>(path: string, token: string | null, data: {[name: string]: any; } | null = null, method?: "GET" | "DELETE" | "PUT"): Promise<T> {
    // host can contains port, but node http doesn't support host as url does
    const baseUrl = parseUrl(`https://${this.info.host || "api.github.com"}`)
    return parseJson(httpExecutor.request(configureRequestOptions({
      hostname: baseUrl.hostname,
      port: baseUrl.port as any,
      path: (this.info.host != null && this.info.host !== "github.com") ? `/api/v3${path.startsWith("/") ? path : `/${path}`}` : path,
      headers: {Accept: "application/vnd.github.v3+json"}
    }, token, method), this.context.cancellationToken, data))
  }

  toString() {
    return `Github (owner: ${this.info.owner}, project: ${this.info.repo}, version: ${this.version})`
  }
}