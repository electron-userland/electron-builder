import { Arch, InvalidConfigurationError, isEmptyOrSpaces, isEnvTrue, isTokenCharValid, log } from "builder-util"
import { configureRequestOptions, GithubOptions, HttpError, parseJson } from "builder-util-runtime"
import { Fields } from "builder-util/out/log"
import { httpExecutor } from "builder-util/out/nodeHttpExecutor"
import { ClientRequest } from "http"
import { Lazy } from "lazy-val"
import mime from "mime"
import { parse as parseUrl, UrlWithStringQuery } from "url"
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
  private readonly tag: string
  readonly _release = new Lazy(() => this.token === "__test__" ? Promise.resolve(null as any) : this.getOrCreateRelease())

  private readonly token: string

  readonly providerName = "GitHub"

  private readonly releaseType: "draft" | "prerelease" | "release"

  private releaseLogFields: Fields | null = null

  constructor(context: PublishContext, private readonly info: GithubOptions, private readonly version: string, private readonly options: PublishOptions = {}) {
    super(context, true)

    let token = info.token
    if (isEmptyOrSpaces(token)) {
      token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
      if (isEmptyOrSpaces(token)) {
        throw new InvalidConfigurationError(`GitHub Personal Access Token is not set, neither programmatically, nor using env "GH_TOKEN"`)
      }

      token = token.trim()

      if (!isTokenCharValid(token)) {
        throw new InvalidConfigurationError(`GitHub Personal Access Token (${JSON.stringify(token)}) contains invalid characters, please check env "GH_TOKEN"`)
      }
    }

    this.token = token!

    if (version.startsWith("v")) {
      throw new InvalidConfigurationError(`Version must not start with "v": ${version}`)
    }

    this.tag = info.vPrefixedTagName === false ? version : `v${version}`

    if (isEnvTrue(process.env.EP_DRAFT)) {
      this.releaseType = "draft"
      log.info({reason: "env EP_DRAFT is set to true"}, "GitHub provider release type is set to draft")
    }
    else if (isEnvTrue(process.env.EP_PRE_RELEASE) || isEnvTrue(process.env.EP_PRELEASE) /* https://github.com/electron-userland/electron-builder/issues/2878 */) {
      this.releaseType = "prerelease"
      log.info({reason: "env EP_PRE_RELEASE is set to true"}, "GitHub provider release type is set to prerelease")
    }
    else if (info.releaseType != null) {
      this.releaseType = info.releaseType
    }
    else if ((options as any).prerelease) {
      this.releaseType = "prerelease"
    }
    else {
      // noinspection PointlessBooleanExpressionJS
      this.releaseType = (options as any).draft === false ? "release" : "draft"
    }
  }

  private async getOrCreateRelease(): Promise<Release | null> {
    const logFields = {
      tag: this.tag,
      version: this.version,
    }

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
      // https://github.com/electron-userland/electron-builder/issues/2072
      if (this.releaseType === "draft") {
        this.releaseLogFields = {
          reason: "existing type not compatible with publishing type",
          ...logFields,
          existingType: release.prerelease ? "pre-release" : "release",
          publishingType: this.releaseType,
        }
        log.warn(this.releaseLogFields, "GitHub release not created")
        return null
      }

      // https://github.com/electron-userland/electron-builder/issues/1133
      // https://github.com/electron-userland/electron-builder/issues/2074
      // if release created < 2 hours — allow to upload
      const publishedAt = release.published_at == null ? null : Date.parse(release.published_at)
      if (publishedAt != null && (Date.now() - publishedAt) > (2 * 3600 * 1000)) {
        // https://github.com/electron-userland/electron-builder/issues/1183#issuecomment-275867187
        this.releaseLogFields = {
          reason: "existing release published more than 2 hours ago",
          ...logFields,
          date: new Date(publishedAt).toString(),
        }
        log.warn(this.releaseLogFields, "GitHub release not created")
        return null
      }
      return release
    }

    // https://github.com/electron-userland/electron-builder/issues/1835
    if (this.options.publish === "always" || getCiTag() != null) {
      log.info({
        reason: "release doesn't exist",
        ...logFields,
      }, `creating GitHub release`)
      return this.createRelease()
    }

    this.releaseLogFields = {
      reason: "release doesn't exist and not created because \"publish\" is not \"always\" and build is not on tag",
      ...logFields,
    }
    return null
  }

  private async overwriteArtifact(fileName: string, release: Release) {
    // delete old artifact and re-upload
    log.warn({file: fileName, reason: "already exists on GitHub"}, "overwrite published file")

    const assets = await this.githubRequest<Array<Asset>>(`/repos/${this.info.owner}/${this.info.repo}/releases/${release.id}/assets`, this.token, null)
    for (const asset of assets) {
      if (asset!.name === fileName) {
        await this.githubRequest<void>(`/repos/${this.info.owner}/${this.info.repo}/releases/assets/${asset!.id}`, this.token, null, "DELETE")
        return
      }
    }

    log.debug({file: fileName, reason: "not found on GitHub"}, "trying to upload again")
  }

  protected async doUpload(fileName: string, arch: Arch, dataLength: number, requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void): Promise<any> {
    const release = await this._release.value
    if (release == null) {
      log.warn({file: fileName, ...this.releaseLogFields}, "skipped publishing")
      return
    }

    const parsedUrl = parseUrl(release.upload_url.substring(0, release.upload_url.indexOf("{")) + "?name=" + fileName)
    return await this.doUploadFile(0, parsedUrl, fileName, dataLength, requestProcessor, release)
  }

  private doUploadFile(attemptNumber: number, parsedUrl: UrlWithStringQuery, fileName: string, dataLength: number, requestProcessor: (request: ClientRequest, reject: (error: Error) => void) => void, release: any): Promise<any> {
    return httpExecutor.doApiRequest(configureRequestOptions({
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: "POST",
      headers: {
        accept: "application/vnd.github.v3+json",
        "Content-Type": mime.getType(fileName) || "application/octet-stream",
        "Content-Length": dataLength
      }
    }, this.token), this.context.cancellationToken, requestProcessor)
      .catch(e => {
        if ((e as any).statusCode === 422 && e.description != null && e.description.errors != null && e.description.errors[0].code === "already_exists") {
          return this.overwriteArtifact(fileName, release)
            .then(() => this.doUploadFile(attemptNumber, parsedUrl, fileName, dataLength, requestProcessor, release))
        }

        if (attemptNumber > 3) {
          return Promise.reject(e)
        }
        else {
          return new Promise((resolve, reject) => {
            const newAttemptNumber = attemptNumber + 1
            setTimeout(() => {
              this.doUploadFile(newAttemptNumber, parsedUrl, fileName, dataLength, requestProcessor, release)
                .then(resolve)
                .catch(reject)
            }, newAttemptNumber * 2000)
          })
        }
      })
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
    return this.githubRequest<Release>(`/repos/${this.info.owner}/${this.info.repo}/releases/${(await this._release.value)!.id}`, this.token)
  }

  //noinspection JSUnusedGlobalSymbols
  async deleteRelease(): Promise<any> {
    if (!this._release.hasValue) {
      return
    }

    const release = await this._release.value
    for (let i = 0; i < 3; i++) {
      try {
        return await this.githubRequest(`/repos/${this.info.owner}/${this.info.repo}/releases/${release.id}`, this.token, null, "DELETE")
      }
      catch (e) {
        if (e instanceof HttpError) {
          if (e.statusCode === 404) {
            log.warn({releaseId: release.id, reason: "doesn't exist"}, "cannot delete release")
            return
          }
          else if (e.statusCode === 405 || e.statusCode === 502) {
            continue
          }
        }

        throw e
      }
    }

    log.warn({releaseId: release.id}, "cannot delete release")
  }

  private githubRequest<T>(path: string, token: string | null, data: {[name: string]: any } | null = null, method?: "GET" | "DELETE" | "PUT"): Promise<T> {
    // host can contains port, but node http doesn't support host as url does
    const baseUrl = parseUrl(`https://${this.info.host || "api.github.com"}`)
    return parseJson(httpExecutor.request(configureRequestOptions({
      hostname: baseUrl.hostname,
      port: baseUrl.port as any,
      path: (this.info.host != null && this.info.host !== "github.com") ? `/api/v3${path.startsWith("/") ? path : `/${path}`}` : path,
      headers: {accept: "application/vnd.github.v3+json"}
    }, token, method), this.context.cancellationToken, data))
  }

  toString() {
    return `Github (owner: ${this.info.owner}, project: ${this.info.repo}, version: ${this.version})`
  }
}
