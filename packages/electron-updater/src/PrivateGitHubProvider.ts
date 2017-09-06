import { CancellationToken, GithubOptions, HttpError, HttpExecutor, UpdateInfo } from "builder-util-runtime"
import { session } from "electron"
import { OutgoingHttpHeaders, RequestOptions } from "http"
import { safeLoad } from "js-yaml"
import * as path from "path"
import { URL } from "url"
import { NET_SESSION_NAME } from "./electronHttpExecutor"
import { BaseGitHubProvider } from "./GitHubProvider"
import { FileInfo, getChannelFilename, getDefaultChannelName, newUrlFromBase, Provider } from "./main"

export interface PrivateGitHubUpdateInfo extends UpdateInfo {
  assets: Array<Asset>
}

export class PrivateGitHubProvider extends BaseGitHubProvider<PrivateGitHubUpdateInfo> {
  private readonly netSession = (session as any).fromPartition(NET_SESSION_NAME)

  constructor(options: GithubOptions, private readonly token: string, executor: HttpExecutor<any>) {
    super(options, "api.github.com", executor)

    this.registerHeaderRemovalListener()
  }

  protected createRequestOptions(url: URL, headers?: OutgoingHttpHeaders | null): RequestOptions {
    const result = super.createRequestOptions(url, headers);
    (result as any).session = this.netSession
    return result
  }

  async getLatestVersion(): Promise<PrivateGitHubUpdateInfo> {
    const basePath = this.basePath
    const cancellationToken = new CancellationToken()
    const channelFile = getChannelFilename(getDefaultChannelName())

    const assets = await this.getLatestVersionInfo(basePath, cancellationToken)
    const url = new URL(assets.find(it => it.name === channelFile)!.url)
    let result: any
    try {
      result = safeLoad((await this.httpRequest(url, this.configureHeaders("application/octet-stream"), cancellationToken))!!)
    }
    catch (e) {
      if (e instanceof HttpError && e.response.statusCode === 404) {
        throw new Error(`Cannot find ${channelFile} in the latest release artifacts (${url}): ${e.stack || e.message}`)
      }
      throw e
    }

    Provider.validateUpdateInfo(result);
    (result as PrivateGitHubUpdateInfo).assets = assets
    return result
  }

  private registerHeaderRemovalListener(): void {
    const filter = {
      urls: ["*://*.amazonaws.com/*"]
    }

    this.netSession.webRequest.onBeforeSendHeaders(filter, (details: any, callback: any) => {
      if (details.requestHeaders.Authorization != null) {
        delete details.requestHeaders.Authorization
      }

      callback({cancel: false, requestHeaders: details.requestHeaders})
    })
  }

  private configureHeaders(accept: string) {
    return {
      Accept: accept,
      Authorization: `token ${this.token}`,
    }
  }

  private async getLatestVersionInfo(basePath: string, cancellationToken: CancellationToken): Promise<Array<Asset>> {
    const url = newUrlFromBase(`${basePath}/latest`, this.baseUrl)
    try {
      return (JSON.parse((await this.httpRequest(url, this.configureHeaders("application/vnd.github.v3+json"), cancellationToken))!!)).assets
    }
    catch (e) {
      throw new Error(`Unable to find latest version on GitHub (${url}), please ensure a production release exists: ${e.stack || e.message}`)
    }
  }

  private get basePath() {
    const result = `/repos/${this.options.owner}/${this.options.repo}/releases`
    const host = this.options.host
    return host != null && host !== "github.com" && host !== "api.github.com" ? `/api/v3${result}` : result
  }

  async getUpdateFile(versionInfo: PrivateGitHubUpdateInfo): Promise<FileInfo> {
    const name = versionInfo.githubArtifactName || path.posix.basename(versionInfo.path).replace(/ /g, "-")
    // noinspection JSDeprecatedSymbols
    return {
      name,
      url: versionInfo.assets.find(it => it.name === name)!.url,
      sha512: versionInfo.sha512,
      headers: this.configureHeaders("application/octet-stream"),
      session: this.netSession
    } as any
  }
}

export interface Asset {
  name: string
  url: string
}