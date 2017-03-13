import { HttpError, request } from "electron-builder-http"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"
import { GithubOptions, UpdateInfo, VersionInfo } from "electron-builder-http/out/publishOptions"
import { RequestOptions } from "http"
import { safeLoad } from "js-yaml"
import * as path from "path"
import { parse as parseUrl } from "url"
import { FileInfo, formatUrl, getChannelFilename, getCurrentPlatform, getDefaultChannelName, Provider } from "./api"
import { validateUpdateInfo } from "./GenericProvider"

export class PrivateGitHubProvider extends Provider<VersionInfo> {
  // so, we don't need to parse port (because node http doesn't support host as url does)
  private readonly baseUrl: RequestOptions
  private apiResult: any

  constructor(private readonly options: GithubOptions) {
    super()

    const baseUrl = parseUrl(`${options.protocol || "https"}://${options.host || "api.github.com"}`)
    this.baseUrl = {
      protocol: baseUrl.protocol,
      hostname: baseUrl.hostname,
      port: <any>baseUrl.port,
    }
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    const basePath = this.getBasePath()
    const cancellationToken = new CancellationToken()
    let result: any
    const channelFile = getChannelFilename(getDefaultChannelName())
    const versionUrl = await this.getLatestVersionUrl(basePath, cancellationToken, channelFile)
    const assetPath = parseUrl(versionUrl).path
    const requestOptions = Object.assign({
      path: `${assetPath}?access_token=${process.env.GH_TOKEN}`,
      headers: Object.assign({
        Accept: "application/octet-stream",
        "User-Agent": this.options.owner
      }, this.requestHeaders)
    }, this.baseUrl)
    try {
      result = await request<UpdateInfo>(requestOptions, cancellationToken)
      //Maybe better to parse in httpExecutor ?
      if (typeof result === "string") {
        if (getCurrentPlatform() === "darwin") {
          result = JSON.parse(result)
        }
        else {
          result = safeLoad(result)
        }
      }
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
    return result
  }

  private async getLatestVersionUrl(basePath: string, cancellationToken: CancellationToken, channelFile: string): Promise<string> {
    const requestOptions: RequestOptions = Object.assign({
      path: `${basePath}/latest?access_token=${process.env.GH_TOKEN}`,
      headers: Object.assign({Accept: "application/json", "User-Agent": this.options.owner}, this.requestHeaders)
    }, this.baseUrl)
    try {
      this.apiResult = (await request<any>(requestOptions, cancellationToken))
      return this.apiResult.assets.find((elem: any) => {
        return elem.name == channelFile
      }).url
    }
    catch (e) {
      throw new Error(`Unable to find latest version on GitHub (${formatUrl(<any>requestOptions)}), please ensure a production release exists: ${e.stack || e.message}`)
    }
  }

  private getBasePath() {
    return `/repos/${this.options.owner}/${this.options.repo}/releases`
  }

  async getUpdateFile(versionInfo: UpdateInfo): Promise<FileInfo> {
    const headers = {
      Accept: "application/octet-stream",
      "User-Agent": this.options.owner,
      Authorization: `token ${process.env.GH_TOKEN}`
    }
    
    // space is not supported on GitHub
    if (getCurrentPlatform() === "darwin") {
      const info = <any>versionInfo
      const name = info.url.split("/").pop()
      const assetPath = parseUrl(this.apiResult.assets.find((it: any) => it.name == name).url).path
      info.url = formatUrl(Object.assign({path: `${assetPath}`}, this.baseUrl))
      info.headers = headers
      return info
    }
    else {
      const name = versionInfo.githubArtifactName || path.posix.basename(versionInfo.path).replace(/ /g, "-")
      const assetPath = parseUrl(this.apiResult.assets.find((it: any) => it.name == name).url).path
      return {
        name: name,
        url: formatUrl(Object.assign({path: `${assetPath}`}, this.baseUrl)),
        sha2: versionInfo.sha2,
        headers: headers,
      }
    }
  }
}