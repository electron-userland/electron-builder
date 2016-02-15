import { Release, Asset } from "gh-release"
import { log } from "./util"
import { basename } from "path"
import { parse as parseUrl } from "url"
import * as mime from "mime"
import { stat } from "./promisifed-fs"
import { createReadStream } from "fs"
import { gitHubRequest, HttpError, doGitHubRequest } from "./gitHubRequest"
import { Promise as BluebirdPromise } from "bluebird"
import { tsAwaiter } from "./awaiter"
import { ReadStream } from "tty"
import progressStream = require("progress-stream")
import ProgressBar = require("progress")

const __awaiter = tsAwaiter
Array.isArray(__awaiter)

export interface Publisher {
  upload(path: string): Promise<any>
}

export interface PublishOptions {
  publish?: "onTag" | "onTagOrDraft" | "always" | "never"
  githubToken?: string
}

export class GitHubPublisher implements Publisher {
  private tag: string
  private _releasePromise: BluebirdPromise<Release>

  get releasePromise(): Promise<Release> {
    return this._releasePromise
  }

  constructor(private owner: string, private repo: string, version: string, private token: string, private createReleaseIfNotExists: boolean = true) {
    if (token == null || token.length === 0) {
      throw new Error("GitHub Personal Access Token is not specified")
    }

    this.tag = "v" + version
    this._releasePromise = <BluebirdPromise<Release>>this.init()
  }

  private async init(): Promise<Release> {
    // we don't use "Get a release by tag name" because "tag name" means existing git tag, but we draft release and don't create git tag
    let releases = await gitHubRequest<Array<Release>>(`/repos/${this.owner}/${this.repo}/releases`, this.token)
    for (let release of releases) {
      if (release.tag_name === this.tag) {
        if (!release.draft) {
          if (this.createReleaseIfNotExists) {
            throw new Error("Release must be a draft")
          }
          else {
            return null
          }
        }
        return release
      }
    }

    if (this.createReleaseIfNotExists) {
      log("Release %s doesn't exists, creating one", this.tag)
      return this.createRelease()
    }
    else {
      return null
    }
  }

  async upload(path: string): Promise<void> {
    const fileName = basename(path)
    const release = await this.releasePromise
    if (release == null) {
      return null
    }

    const parsedUrl = parseUrl(release.upload_url.substring(0, release.upload_url.indexOf("{")) + "?name=" + fileName)
    const fileStat = await stat(path)
    uploadAttempt: for (let i = 0; i < 3; i++) {
      const progressBar = (<ReadStream>process.stdin).isTTY ? new ProgressBar(`Uploading ${fileName} [:bar] :percent :etas`, {
        total: fileStat.size,
        incomplete: " ",
        stream: process.stdout,
        width: 20,
      }) : null

      try {
        return await doGitHubRequest<any>({
          hostname: parsedUrl.hostname,
          path: parsedUrl.path,
          method: "POST",
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "electron-complete-builder",
            "Content-Type": mime.lookup(fileName),
            "Content-Length": fileStat.size
          }
        }, this.token, (request, reject) => {
          const fileInputStream = createReadStream(path)
          fileInputStream.on("error", reject)
          fileInputStream
            .pipe(progressStream({
              length: fileStat.size,
              time: 1000
            }, progress => progressBar == null ? console.log(".") : progressBar.tick(progress.delta)))
            .pipe(request)
        })
      }
      catch (e) {
        if (e instanceof HttpError) {
          const httpError = <HttpError>e
          if (httpError.response.statusCode === 422 && httpError.description != null && httpError.description.errors != null && httpError.description.errors[0].code === "already_exists") {
            // delete old artifact and re-upload
            log("Artifact %s already exists, overwrite one", fileName)
            const assets = await gitHubRequest<Array<Asset>>(`/repos/${this.owner}/${this.repo}/releases/${release.id}/assets`, this.token)
            for (let asset of assets) {
              if (asset.name === fileName) {
                await gitHubRequest<void>(`/repos/${this.owner}/${this.repo}/releases/assets/${asset.id}`, this.token, null, "DELETE")
                continue uploadAttempt
              }
            }

            log("Artifact %s not found, trying to upload again", fileName)
            continue
          }
        }

        throw e
      }
    }
  }

  private createRelease() {
    return gitHubRequest<Release>(`/repos/${this.owner}/${this.repo}/releases`, this.token, {
      tag_name: this.tag,
      name: this.tag,
      draft: true,
    })
  }

  //noinspection JSUnusedGlobalSymbols
  deleteRelease(): BluebirdPromise<void> {
    if (this._releasePromise.isFulfilled()) {
      return gitHubRequest<void>(`/repos/${this.owner}/${this.repo}/releases/${this._releasePromise.value().id}`, this.token, null, "DELETE")
    }
    else {
      return BluebirdPromise.resolve()
    }
  }
}