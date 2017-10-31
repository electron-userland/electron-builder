import { BintrayOptions, CancellationToken, HttpExecutor, UpdateInfo } from "builder-util-runtime"
import { BintrayClient } from "builder-util-runtime/out/bintray"
import { getChannelFilename, getDefaultChannelName, newBaseUrl, Provider, ResolvedUpdateFileInfo } from "./main"
import { URL } from "url"
import { resolveFiles, parseUpdateInfo } from "./Provider"

export class BintrayProvider extends Provider<UpdateInfo> {
  private client: BintrayClient
  private readonly baseUrl: URL

  constructor(configuration: BintrayOptions, httpExecutor: HttpExecutor<any>) {
    super(httpExecutor)

    this.client = new BintrayClient(configuration, httpExecutor, new CancellationToken())
    this.baseUrl = newBaseUrl(`https://dl.bintray.com/${this.client.owner}/${this.client.repo}`)
  }

  setRequestHeaders(value: any): void {
    super.setRequestHeaders(value)
    this.client.setRequestHeaders(value)
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    try {
      const data = await this.client.getVersion("_latest")
      const channelFilename = getChannelFilename(getDefaultChannelName())
      const files = await this.client.getVersionFiles(data.name)
      const channelFile = files.find(it => it.name.endsWith(`_${channelFilename}`) || it.name.endsWith(`-${channelFilename}`))
      if (channelFile == null) {
        // noinspection ExceptionCaughtLocallyJS
        throw new Error(`Cannot find channel file "${channelFilename}", existing files:\n${files.map(it => JSON.stringify(it, null, 2)).join(",\n")}`)
      }

      const channelFileUrl = new URL(`https://dl.bintray.com/${this.client.owner}/${this.client.repo}/${channelFile.name}`)
      return parseUpdateInfo((await this.executor.request(this.createRequestOptions(channelFileUrl)))!!, channelFilename, channelFileUrl)
    }
    catch (e) {
      if ("response" in e && e.response.statusCode === 404) {
        throw new Error(`No latest version, please ensure that user, package and repository correctly configured. Or at least one version is published. ${e.stack || e.message}`)
      }
      throw e
    }
  }

  resolveFiles(updateInfo: UpdateInfo): Array<ResolvedUpdateFileInfo> {
    return resolveFiles(updateInfo, this.baseUrl)
  }
}