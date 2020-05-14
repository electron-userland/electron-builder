import { BintrayOptions, CancellationToken, newError, UpdateInfo } from "builder-util-runtime"
import { BintrayClient } from "builder-util-runtime/out/bintray"
import { URL } from "url"
import { getChannelFilename, newBaseUrl, Provider, ResolvedUpdateFileInfo } from "../main"
import { parseUpdateInfo, ProviderRuntimeOptions, resolveFiles } from "./Provider"

export class BintrayProvider extends Provider<UpdateInfo> {
  private client: BintrayClient
  private readonly baseUrl: URL

  constructor(configuration: BintrayOptions, runtimeOptions: ProviderRuntimeOptions) {
    super(runtimeOptions)

    this.client = new BintrayClient(configuration, runtimeOptions.executor, new CancellationToken())
    this.baseUrl = newBaseUrl(`https://dl.bintray.com/${this.client.owner}/${this.client.repo}`)
  }

  setRequestHeaders(value: any): void {
    super.setRequestHeaders(value)
    this.client.setRequestHeaders(value)
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    try {
      const data = await this.client.getVersion("_latest")
      const channelFilename = getChannelFilename(this.getDefaultChannelName())
      const files = await this.client.getVersionFiles(data.name)
      const channelFile = files.find(it => it.name.endsWith(`_${channelFilename}`) || it.name.endsWith(`-${channelFilename}`))
      if (channelFile == null) {
        // noinspection ExceptionCaughtLocallyJS
        throw newError(`Cannot find channel file "${channelFilename}", existing files:\n${files.map(it => JSON.stringify(it, null, 2)).join(",\n")}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND")
      }

      const channelFileUrl = new URL(`https://dl.bintray.com/${this.client.owner}/${this.client.repo}/${channelFile.name}`)
      return parseUpdateInfo(await this.httpRequest(channelFileUrl), channelFilename, channelFileUrl)
    }
    catch (e) {
      if ("statusCode" in e && e.statusCode === 404) {
        throw newError(`No latest version, please ensure that user, package and repository correctly configured. Or at least one version is published. ${e.stack || e.message}`, "ERR_UPDATER_LATEST_VERSION_NOT_FOUND")
      }
      throw e
    }
  }

  resolveFiles(updateInfo: UpdateInfo): Array<ResolvedUpdateFileInfo> {
    return resolveFiles(updateInfo, this.baseUrl)
  }
}