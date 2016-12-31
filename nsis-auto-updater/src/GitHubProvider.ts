import { Provider, FileInfo } from "./api"
import { VersionInfo, GithubOptions, UpdateInfo } from "../../src/options/publishOptions"
import { validateUpdateInfo } from "./GenericProvider"
import * as path from "path"
import { HttpError, request } from "../../src/util/httpExecutor"

export class GitHubProvider implements Provider<VersionInfo> {
  constructor(private readonly options: GithubOptions) {
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    // do not use API to avoid limit
    const basePath = this.getBasePath()
    let version = (await request<ReleaseInfo>(
      {hostname: "github.com", path: `${basePath}/latest`},
      null,
      null,
      "GET",
      {"Accept": "application/json"}
    )).tag_name

    try {
      version = (version.startsWith("v")) ? version.substring(1) : version
    }
    catch (e) {
      throw new Error(`Cannot parse determine latest version from github "${version}": ${e.stack || e.message}`)
    }

    let result: UpdateInfo | null = null
    try {
      result = await request<UpdateInfo>({
        hostname: "github.com",
        path: `https://github.com${basePath}/download/v${version}/latest.yml`
      })
    }
    catch (e) {
      if (e instanceof HttpError && e.response.statusCode === 404) {
        throw new Error(`Cannot find latest.yml in the latest release artifacts: ${e.stack || e.message}`)
      }
      throw e
    }

    validateUpdateInfo(result)
    return result
  }

  private getBasePath() {
    return `/${this.options.owner}/${this.options.repo}/releases`
  }

  async getUpdateFile(versionInfo: UpdateInfo): Promise<FileInfo> {
    const basePath = this.getBasePath()
    // space is not supported on GitHub
    const name = path.posix.basename(versionInfo.path).replace(/ /g, "-")
    return {
      name: name,
      url: `https://github.com${basePath}/download/v${versionInfo.version}/${name}`,
      sha2: versionInfo.sha2,
    }
  }
}

interface ReleaseInfo {
  readonly tag_name: string
}