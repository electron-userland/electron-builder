import { CancellationToken, GithubOptions, githubUrl, HttpError, HttpExecutor, UpdateInfo, WindowsUpdateInfo } from "builder-util-runtime"
import { safeLoad } from "js-yaml"
import * as path from "path"
import { URL } from "url"
import { AppUpdater } from "./AppUpdater"
import { FileInfo, getChannelFilename, getDefaultChannelName, isUseOldMacProvider, newBaseUrl, newUrlFromBase, Provider } from "./main"

export abstract class BaseGitHubProvider<T extends UpdateInfo> extends Provider<T> {
  // so, we don't need to parse port (because node http doesn't support host as url does)
  protected readonly baseUrl: URL

  constructor(protected readonly options: GithubOptions, defaultHost: string, executor: HttpExecutor<any>) {
    super(executor)

    this.baseUrl = newBaseUrl(githubUrl(options, defaultHost))
  }

  protected computeGithubBasePath(result: string) {
    // https://github.com/electron-userland/electron-builder/issues/1903#issuecomment-320881211
    const host = this.options.host
    return host != null && host !== "github.com" && host !== "api.github.com" ? `/api/v3${result}` : result
  }
}

export class GitHubProvider extends BaseGitHubProvider<UpdateInfo> {
  constructor(protected readonly options: GithubOptions, private readonly updater: AppUpdater, executor: HttpExecutor<any>) {
    super(options, "github.com", executor)
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    const basePath = this.basePath
    const cancellationToken = new CancellationToken()

    const xElement = require("xelement")
    const feedXml = await this.httpRequest(newUrlFromBase(`${basePath}.atom`, this.baseUrl), {
      Accept: "application/xml, application/atom+xml, text/xml, */*",
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
    const channelFileUrl = newUrlFromBase(this.getBaseDownloadPath(version, channelFile), this.baseUrl)
    const requestOptions = this.createRequestOptions(channelFileUrl)
    let rawData: string
    try {
      rawData = (await this.executor.request(requestOptions, cancellationToken))!!
    }
    catch (e) {
      if (!this.updater.allowPrerelease) {
        if (e instanceof HttpError && e.response.statusCode === 404) {
          throw new Error(`Cannot find ${channelFile} in the latest release artifacts (${channelFileUrl}): ${e.stack || e.message}`)
        }
      }
      throw e
    }

    try {
      result = safeLoad(rawData)
    }
    catch (e) {
      throw new Error(`Cannot parse update info from ${channelFile} in the latest release artifacts (${channelFileUrl}): ${e.stack || e.message}, rawData: ${rawData}`)
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
    const url = newUrlFromBase(`${basePath}/latest`, this.baseUrl)
    try {
      // do not use API to avoid limit
      const rawData = await this.httpRequest(url, {Accept: "application/json"}, cancellationToken)
      if (rawData == null) {
        return null
      }

      const releaseInfo: GithubReleaseInfo = JSON.parse(rawData)
      return (releaseInfo.tag_name.startsWith("v")) ? releaseInfo.tag_name.substring(1) : releaseInfo.tag_name
    }
    catch (e) {
      throw new Error(`Unable to find latest version on GitHub (${url}), please ensure a production release exists: ${e.stack || e.message}`)
    }
  }

  private get basePath() {
    return this.computeGithubBasePath(`/${this.options.owner}/${this.options.repo}/releases`)
  }

  async getUpdateFile(versionInfo: UpdateInfo): Promise<FileInfo> {
    if (isUseOldMacProvider()) {
      return versionInfo as any
    }

    // space is not supported on GitHub
    const name = versionInfo.githubArtifactName || path.posix.basename(versionInfo.path).replace(/ /g, "-")
    const result: FileInfo = {
      name,
      url: newUrlFromBase(this.getBaseDownloadPath(versionInfo.version, name), this.baseUrl).href,
      sha512: versionInfo.sha512,
    }

    const packages = (versionInfo as WindowsUpdateInfo).packages
    const packageInfo = packages == null ? null : (packages[process.arch] || packages.ia32)
    if (packageInfo != null) {
      result.packageInfo = {
        ...packageInfo,
        path: newUrlFromBase(this.getBaseDownloadPath(versionInfo.version, packageInfo.path || (packageInfo as any).file), this.baseUrl).href,
      }
    }
    return result
  }

  private getBaseDownloadPath(version: string, fileName: string) {
    return `${this.basePath}/download/${this.options.vPrefixedTagName === false ? "" : "v"}${version}/${fileName}`
  }
}

interface GithubReleaseInfo {
  readonly tag_name: string
}