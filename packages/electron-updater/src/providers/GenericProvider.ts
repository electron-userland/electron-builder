import { GenericServerOptions, HttpError, newError, UpdateInfo } from "builder-util-runtime"
import { AppUpdater } from "../AppUpdater"
import { getChannelFilename, newBaseUrl, newUrlFromBase, Provider, ResolvedUpdateFileInfo } from "../main"
import { parseUpdateInfo, ProviderRuntimeOptions, resolveFiles } from "./Provider"

export class GenericProvider extends Provider<UpdateInfo> {
  private readonly baseUrl = newBaseUrl(this.configuration.url)

  constructor(private readonly configuration: GenericServerOptions, private readonly updater: AppUpdater, runtimeOptions: ProviderRuntimeOptions) {
    super(runtimeOptions)
  }

  private get channel(): string {
    const result = this.updater.channel || this.configuration.channel
    return result == null ? this.getDefaultChannelName() : this.getCustomChannelName(result)
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    const channelFile = getChannelFilename(this.channel)
    const channelUrl = newUrlFromBase(channelFile, this.baseUrl, this.updater.isAddNoCacheQuery)
    for (let attemptNumber = 0; ; attemptNumber++) {
      try {
        return parseUpdateInfo(await this.httpRequest(channelUrl), channelFile, channelUrl)
      }
      catch (e) {
        if (e instanceof HttpError && e.statusCode === 404) {
          throw newError(`Cannot find channel "${channelFile}" update info: ${e.stack || e.message}`, "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND")
        }
        else if (e.code === "ECONNREFUSED") {
          if (attemptNumber < 3) {
            await new Promise((resolve, reject) => {
              try {
                setTimeout(resolve, 1000 * attemptNumber)
              }
              catch (e) {
                reject(e)
              }
            })
            continue
          }
        }
        throw e
      }
    }
  }

  resolveFiles(updateInfo: UpdateInfo): Array<ResolvedUpdateFileInfo> {
    return resolveFiles(updateInfo, this.baseUrl)
  }
}