import { Provider, FileInfo, getDefaultChannelName, getChannelFilename, getCurrentPlatform } from "./api"
import { VersionInfo, GithubOptions, UpdateInfo, githubUrl } from "electron-builder-http/out/publishOptions"
import { validateUpdateInfo } from "./GenericProvider"
import * as path from "path"
import { HttpError, request } from "electron-builder-http"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"
import * as url from "url"
import { RequestOptions } from "http"

export class GitHubProvider extends Provider<VersionInfo> {
  // so, we don't need to parse port (because node http doesn't support host as url does)
  private readonly baseUrl: RequestOptions

  constructor(private readonly options: GithubOptions) {
    super()

    const baseUrl = url.parse(`${options.protocol || "https:"}//${options.host || "github.com"}`)
    this.baseUrl = {
      protocol: baseUrl.protocol,
      hostname: baseUrl.hostname,
      port: <any>baseUrl.port,
    }
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    const basePath = this.getBasePath()
    let version

    const cancellationToken = new CancellationToken()
    try {
      // do not use API to avoid limit
      const releaseInfo = (await request<GithubReleaseInfo>(Object.assign({
        path: `${basePath}/latest`,
        headers: Object.assign({Accept: "application/json"}, this.requestHeaders)
      }, this.baseUrl), cancellationToken))
      version = (releaseInfo.tag_name.startsWith("v")) ? releaseInfo.tag_name.substring(1) : releaseInfo.tag_name
    }
    catch (e) {
      throw new Error(`Unable to find latest version on github, please ensure a production release exists: ${e.stack || e.message}`)
    }

    let result: any
    const channelFile = getChannelFilename(getDefaultChannelName())
    const channelFileUrlPath = `${basePath}/download/v${version}/${channelFile}`
    try {
      result = await request<UpdateInfo>(Object.assign({path: channelFileUrlPath, headers: this.requestHeaders || undefined}, this.baseUrl), cancellationToken)
    }
    catch (e) {
      if (e instanceof HttpError && e.response.statusCode === 404) {
        throw new Error(`Cannot find ${channelFile} in the latest release artifacts: ${e.stack || e.message}`)
      }
      throw e
    }

    validateUpdateInfo(result)
    if (getCurrentPlatform() === "darwin") {
      result.releaseJsonUrl = `${githubUrl(this.options)}/${channelFileUrlPath}`
    }
    return result
  }

  private getBasePath() {
    return `/${this.options.owner}/${this.options.repo}/releases`
  }

  async getUpdateFile(versionInfo: UpdateInfo): Promise<FileInfo> {
    if (getCurrentPlatform() === "darwin") {
      return <any>versionInfo
    }

    const basePath = this.getBasePath()
    // space is not supported on GitHub
    const name = versionInfo.githubArtifactName || path.posix.basename(versionInfo.path).replace(/ /g, "-")
    return {
      name: name,
      url: url.format(Object.assign({pathname: `${basePath}/download/v${versionInfo.version}/${name}`}, this.baseUrl)),
      sha2: versionInfo.sha2,
    }
  }
}

interface GithubReleaseInfo {
  readonly tag_name: string
}