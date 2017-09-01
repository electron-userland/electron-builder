import { CancellationToken, HttpError, HttpExecutor, RequestOptionsEx } from "electron-builder-http"
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

  constructor(protected readonly options: GithubOptions, defaultHost: string) {
    super()

    const baseUrl = parseUrl(githubUrl(options, defaultHost))
    this.baseUrl = {
      protocol: baseUrl.protocol,
      hostname: baseUrl.hostname,
      port: baseUrl.port as any,
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
    const feedXml = await this.executor.request({
      path: `${basePath}.atom`,
      headers: {...this.requestHeaders, Accept: "application/xml, application/atom+xml, text/xml, */*"},
      ...this.baseUrl as any
    }, cancellationToken)

    const feed = new xElement.Parse(feedXml)
    const latestRelease = feed.element("entry")
    if (latestRelease == null) {
      throw new Error(`No published versions on GitHub`)
    }

    let version: string | null
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

    if (version == null) {
      throw new Error(`No published versions on GitHub`)
    }

    let result: UpdateInfo
    const channelFile = getChannelFilename(getDefaultChannelName())
    const requestOptions = {path: this.getBaseDownloadPath(version, channelFile), headers: this.requestHeaders || undefined, ...this.baseUrl}
    let rawData: string
    try {
      rawData = (await this.executor.request(requestOptions, cancellationToken))!!
    }
    catch (e) {
      if (!this.updater.allowPrerelease) {
        if (e instanceof HttpError && e.response.statusCode === 404) {
          throw new Error(`Cannot find ${channelFile} in the latest release artifacts (${formatUrl(requestOptions as any)}): ${e.stack || e.message}`)
        }
      }
      throw e
    }

    try {
      result = safeLoad(rawData)
    }
    catch (e) {
      throw new Error(`Cannot parse update info from ${channelFile} in the latest release artifacts (${formatUrl(requestOptions as any)}): ${e.stack || e.message}, rawData: ${rawData}`)
    }

    Provider.validateUpdateInfo(result)
    if (isUseOldMacProvider()) {
      (result as any).releaseJsonUrl = `${githubUrl(this.options)}/${requestOptions.path}`
    }

    if (result.releaseName == null) {
      (result as any).releaseName = latestRelease.getElementValue("title")
    }
    if (result.releaseNotes == null) {
      (result as any).releaseNotes = latestRelease.getElementValue("content")
    }
    return result
  }

  private async getLatestVersionString(basePath: string, cancellationToken: CancellationToken): Promise<string | null> {
    const requestOptions: RequestOptionsEx = {
      path: `${basePath}/latest`,
      headers: {...this.requestHeaders, Accept: "application/json"}, ...this.baseUrl as any}
    try {
      // do not use API to avoid limit
      const rawData = await this.executor.request(requestOptions, cancellationToken)
      if (rawData == null) {
        return null
      }

      const releaseInfo: GithubReleaseInfo = JSON.parse(rawData)
      return (releaseInfo.tag_name.startsWith("v")) ? releaseInfo.tag_name.substring(1) : releaseInfo.tag_name
    }
    catch (e) {
      throw new Error(`Unable to find latest version on GitHub (${formatUrl(requestOptions as any)}), please ensure a production release exists: ${e.stack || e.message}`)
    }
  }

  private get basePath() {
    const result = `/${this.options.owner}/${this.options.repo}/releases`
    // https://github.com/electron-userland/electron-builder/issues/1903#issuecomment-320881211
    const host = this.options.host
    return host != null && host !== "github.com" && host !== "api.github.com" ? `/api/v3${result}` : result
  }

  async getUpdateFile(versionInfo: UpdateInfo): Promise<FileInfo> {
    if (isUseOldMacProvider()) {
      return versionInfo as any
    }

    // space is not supported on GitHub
    const name = versionInfo.githubArtifactName || path.posix.basename(versionInfo.path).replace(/ /g, "-")
    // noinspection JSDeprecatedSymbols
    return {
      name,
      url: formatUrl({path: this.getBaseDownloadPath(versionInfo.version, name), ...this.baseUrl} as any),
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