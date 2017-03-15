import { HttpError, request } from "electron-builder-http"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"
import { GithubOptions, UpdateInfo } from "electron-builder-http/out/publishOptions"
import { RequestOptions } from "http"
import * as path from "path"
import { parse as parseUrl } from "url"
import { FileInfo, formatUrl, getChannelFilename, getCurrentPlatform, getDefaultChannelName } from "./api"
import { validateUpdateInfo } from "./GenericProvider"
import { BaseGitHubProvider } from "./GitHubProvider"

interface PrivateGitHubUpdateInfo extends UpdateInfo {
  assets: Array<Asset>
}

export class PrivateGitHubProvider extends BaseGitHubProvider<PrivateGitHubUpdateInfo> {
  constructor(options: GithubOptions, private readonly token: string) {
    super(options, "api.github.com")
  }
  
  async getLatestVersion(): Promise<PrivateGitHubUpdateInfo> {
    const basePath = this.basePath
    const cancellationToken = new CancellationToken()
    const channelFile = getChannelFilename(getDefaultChannelName())
    
    const assets = await this.getLatestVersionInfo(basePath, cancellationToken)
    const requestOptions = Object.assign({
      headers: this.configureHeaders("application/octet-stream")
    }, parseUrl(assets.find(it => it.name == channelFile)!.url))
    let result: any
    try {
      result = await request<UpdateInfo>(requestOptions, cancellationToken)
    }
    catch (e) {
      if (e instanceof HttpError && e.response.statusCode === 404) {
        throw new Error(`Cannot find ${channelFile} in the latest release artifacts (${formatUrl(<any>requestOptions)}): ${e.stack || e.message}`)
      }
      throw e
    }

    validateUpdateInfo(result)
    if (getCurrentPlatform() === "darwin") {
      result.releaseJsonUrl = `${this.options.protocol || "https"}://${this.options.host || "api.github.com"}${requestOptions.path}`
    }
    (<PrivateGitHubUpdateInfo>result).assets = assets
    return result
  }

  private configureHeaders(accept: string) {
    return Object.assign({
      Accept: accept,
      Authorization: `token ${this.token}`,
    }, this.requestHeaders)
  }
  
  private async getLatestVersionInfo(basePath: string, cancellationToken: CancellationToken): Promise<Array<Asset>> {
    const requestOptions: RequestOptions = Object.assign({
      path: `${basePath}/latest`,
      headers: this.configureHeaders("application/vnd.github.v3+json"),
    }, this.baseUrl)
    try {
      return (await request<any>(requestOptions, cancellationToken)).assets
    }
    catch (e) {
      throw new Error(`Unable to find latest version on GitHub (${formatUrl(<any>requestOptions)}), please ensure a production release exists: ${e.stack || e.message}`)
    }
  }

  private get basePath() {
    return `/repos/${this.options.owner}/${this.options.repo}/releases`
  }

  async getUpdateFile(versionInfo: PrivateGitHubUpdateInfo): Promise<FileInfo> {
    const headers = {
      Accept: "application/octet-stream",
      Authorization: `token ${this.token}`
    }
    
    // space is not supported on GitHub
    if (getCurrentPlatform() === "darwin") {
      const info = <any>versionInfo
      const name = info.url.split("/").pop()
      const assetPath = parseUrl(versionInfo.assets.find(it => it.name == name)!.url).path
      info.url = formatUrl(Object.assign({path: `${assetPath}`}, this.baseUrl))
      info.headers = headers
      return info
    }
    else {
      const name = versionInfo.githubArtifactName || path.posix.basename(versionInfo.path).replace(/ /g, "-")
      return {
        name: name,
        url: versionInfo.assets.find(it => it.name == name)!.url,
        sha2: versionInfo.sha2,
        headers: headers,
      }
    }
  }
}

interface Asset {
  name: string
  url: string
}