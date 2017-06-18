import { CancellationToken, HttpError, HttpExecutor } from "electron-builder-http"
import { GithubOptions, githubUrl } from "electron-builder-http/out/publishOptions"
import { UpdateInfo } from "electron-builder-http/out/updateInfo"
import { RequestOptions } from "http"
import { safeLoad } from "js-yaml"
import * as path from "path"
import { parse as parseUrl } from "url"
import { AppUpdater } from "./AppUpdater"
import { FileInfo, formatUrl, getChannelFilename, getDefaultChannelName, isUseOldMacProvider, Provider } from "./main"

export abstract class BaseGitHubProvider<T extends UpdateInfo> extends Provider<T> {
  // so, we don't need to parse port (because node http doesn't support host as url does)
  protected readonly baseUrl: RequestOptions
  
  constructor(protected readonly options: GithubOptions, baseHost: string) {
    super()

    const baseUrl = parseUrl(`${options.protocol || "https"}://${options.host || baseHost}`)
    this.baseUrl = {
      protocol: baseUrl.protocol,
      hostname: baseUrl.hostname,
      port: <any>baseUrl.port,
    }
  }
}

export class GitHubProvider extends BaseGitHubProvider<UpdateInfo> {
  constructor(protected readonly options: GithubOptions, private readonly updater: AppUpdater, private readonly executor: HttpExecutor<any>) {
    super(options, "github.com")
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    const basePath = this.basePath
    const cancellationToken = new CancellationToken()

    const xElement = require("xelement")
    const feedXml = await this.executor.request(Object.assign({
      path: `${basePath}.atom`,
      headers: Object.assign({}, this.requestHeaders, {Accept: "application/xml"})
    }, this.baseUrl), cancellationToken)

    const feed = new xElement.Parse(feedXml)
    const latestRelease = feed.element("entry")
    if (latestRelease == null) {
      throw new Error(`No published versions on GitHub`)
    }

    let version: string
    try {
      if (this.updater.allowPrerelease) {
        version = latestRelease.element("link").getAttr("href").match(/\/tag\/v?([^\/]+)$/)[1]
      }
      else {
        version = await this.getLatestVersionString(basePath, cancellationToken)
      }
    }
    catch (e) {
      throw new Error(`Cannot parse releases feed: ${e.stack || e.message},\nXML:\n${feedXml}`)
    }

    let result: UpdateInfo
    const channelFile = getChannelFilename(getDefaultChannelName())
    const requestOptions = Object.assign({path: this.getBaseDownloadPath(version, channelFile), headers: this.requestHeaders || undefined}, this.baseUrl)
    let rawData: string
    try {
      rawData = await this.executor.request<string>(requestOptions, cancellationToken)
    }
    catch (e) {
      if (!this.updater.allowPrerelease) {
        if (e instanceof HttpError && e.response.statusCode === 404) {
          throw new Error(`Cannot find ${channelFile} in the latest release artifacts (${formatUrl(<any>requestOptions)}): ${e.stack || e.message}`)
        }
      }
      throw e
    }

    try {
      result = safeLoad(rawData)
    }
    catch (e) {
      throw new Error(`Cannot parse update info from ${channelFile} in the latest release artifacts (${formatUrl(<any>requestOptions)}): ${e.stack || e.message}, rawData: ${rawData}`)
    }

    Provider.validateUpdateInfo(result)
    if (isUseOldMacProvider()) {
      (<any>result).releaseJsonUrl = `${githubUrl(this.options)}/${requestOptions.path}`
    }

    if (result.releaseName == null) {
      (<any>result).releaseName = latestRelease.getElementValue("title")
    }
    if (result.releaseNotes == null) {
      (<any>result).releaseNotes = latestRelease.getElementValue("content")
    }
    return result
  }

  private async getLatestVersionString(basePath: string, cancellationToken: CancellationToken): Promise<string> {
    const requestOptions: RequestOptions = Object.assign({
      path: `${basePath}/latest`,
      headers: Object.assign({}, this.requestHeaders, {Accept: "application/json"})
    }, this.baseUrl)
    try {
      // do not use API to avoid limit
      const releaseInfo = (await this.executor.request<GithubReleaseInfo>(requestOptions, cancellationToken))
      return (releaseInfo.tag_name.startsWith("v")) ? releaseInfo.tag_name.substring(1) : releaseInfo.tag_name
    }
    catch (e) {
      throw new Error(`Unable to find latest version on GitHub (${formatUrl(<any>requestOptions)}), please ensure a production release exists: ${e.stack || e.message}`)
    }
  }

  private get basePath() {
    return `/${this.options.owner}/${this.options.repo}/releases`
  }

  async getUpdateFile(versionInfo: UpdateInfo): Promise<FileInfo> {
    if (isUseOldMacProvider()) {
      return <any>versionInfo
    }

    // space is not supported on GitHub
    const name = versionInfo.githubArtifactName || path.posix.basename(versionInfo.path).replace(/ /g, "-")
    return {
      name: name,
      url: formatUrl(Object.assign({path: this.getBaseDownloadPath(versionInfo.version, name)}, this.baseUrl)),
      sha2: versionInfo.sha2,
      sha512: versionInfo.sha512,
    }
  }
  
  private getBaseDownloadPath(version: string, fileName: string) {
    return `${this.basePath}/download/${this.options.vPrefixedTagName === false ? "" : "v"}${version}/${fileName}`
  }
}

interface GithubReleaseInfo {
  readonly tag_name: string
}