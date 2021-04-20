import { CancellationToken, GithubOptions, HttpError, newError, UpdateInfo } from "builder-util-runtime"
import { OutgoingHttpHeaders, RequestOptions } from "http"
import { load } from "js-yaml"
import * as path from "path"
import { AppUpdater } from "../AppUpdater"
import { URL } from "url"
import { getChannelFilename, newUrlFromBase } from "../util"
import { BaseGitHubProvider } from "./GitHubProvider"
import { ResolvedUpdateFileInfo } from "../main"
import { getFileList, ProviderRuntimeOptions } from "./Provider"

export interface PrivateGitHubUpdateInfo extends UpdateInfo {
  assets: Array<Asset>
}

export class PrivateGitHubProvider extends BaseGitHubProvider<PrivateGitHubUpdateInfo> {
  constructor(options: GithubOptions, private readonly updater: AppUpdater, private readonly token: string, runtimeOptions: ProviderRuntimeOptions) {
    super(options, "api.github.com", runtimeOptions)
  }

  protected createRequestOptions(url: URL, headers?: OutgoingHttpHeaders | null): RequestOptions {
    const result = super.createRequestOptions(url, headers)
    ;(result as any).redirect = "manual"
    return result
  }

  async getLatestVersion(): Promise<PrivateGitHubUpdateInfo> {
    const cancellationToken = new CancellationToken()
    const channelFile = getChannelFilename(this.getDefaultChannelName())

    const releaseInfo = await this.getLatestVersionInfo(cancellationToken)
    const asset = releaseInfo.assets.find(it => it.name === channelFile)
    if (asset == null) {
      // html_url must be always, but just to be sure
      throw newError(`Cannot find ${channelFile} in the release ${releaseInfo.html_url || releaseInfo.name}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND")
    }

    const url = new URL(asset.url)
    let result: any
    try {
      result = load((await this.httpRequest(url, this.configureHeaders("application/octet-stream"), cancellationToken))!)
    } catch (e) {
      if (e instanceof HttpError && e.statusCode === 404) {
        throw newError(`Cannot find ${channelFile} in the latest release artifacts (${url}): ${e.stack || e.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND")
      }
      throw e
    }

    ;(result as PrivateGitHubUpdateInfo).assets = releaseInfo.assets
    return result
  }

  get fileExtraDownloadHeaders(): OutgoingHttpHeaders | null {
    return this.configureHeaders("application/octet-stream")
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  private configureHeaders(accept: string) {
    return {
      accept,
      authorization: `token ${this.token}`,
    }
  }

  private async getLatestVersionInfo(cancellationToken: CancellationToken): Promise<ReleaseInfo> {
    const allowPrerelease = this.updater.allowPrerelease
    let basePath = this.basePath
    if (!allowPrerelease) {
      basePath = `${basePath}/latest`
    }

    const url = newUrlFromBase(basePath, this.baseUrl)
    try {
      const version = JSON.parse((await this.httpRequest(url, this.configureHeaders("application/vnd.github.v3+json"), cancellationToken))!)
      if (allowPrerelease) {
        return (version as Array<{ prerelease: boolean }>).find(it => it.prerelease) || version[0]
      } else {
        return version
      }
    } catch (e) {
      throw newError(`Unable to find latest version on GitHub (${url}), please ensure a production release exists: ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND")
    }
  }

  private get basePath(): string {
    return this.computeGithubBasePath(`/repos/${this.options.owner}/${this.options.repo}/releases`)
  }

  resolveFiles(updateInfo: PrivateGitHubUpdateInfo): Array<ResolvedUpdateFileInfo> {
    return getFileList(updateInfo).map(it => {
      const name = path.posix.basename(it.url).replace(/ /g, "-")
      const asset = updateInfo.assets.find(it => it != null && it.name === name)
      if (asset == null) {
        throw newError(`Cannot find asset "${name}" in: ${JSON.stringify(updateInfo.assets, null, 2)}`, "ERR_UPDATER_ASSET_NOT_FOUND")
      }

      return {
        url: new URL(asset.url),
        info: it,
      }
    })
  }
}

interface ReleaseInfo {
  name: string
  html_url: string
  assets: Array<Asset>
}

export interface Asset {
  name: string
  url: string
}
