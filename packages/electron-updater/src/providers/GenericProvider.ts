import { GenericServerOptions, HttpError, newError, UpdateInfo } from "builder-util-runtime"
import { AppUpdater } from "../AppUpdater"
import { getChannelFilename, getCustomChannelName, getDefaultChannelName, isUseOldMacProvider, newBaseUrl, newUrlFromBase, Provider, ResolvedUpdateFileInfo } from "../main"
import { parseUpdateInfo, resolveFiles } from "./Provider"

export class GenericProvider extends Provider<UpdateInfo> {
  private readonly baseUrl = newBaseUrl(this.configuration.url)

  constructor(private readonly configuration: GenericServerOptions, private readonly updater: AppUpdater, useMultipleRangeRequest = true) {
    super(updater.httpExecutor, useMultipleRangeRequest)
  }

  private get channel(): string {
    const result = this.updater.channel || this.configuration.channel
    return result == null ? getDefaultChannelName() : getCustomChannelName(result)
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    let result: UpdateInfo
    const channelFile = getChannelFilename(this.channel)
    const channelUrl = newUrlFromBase(channelFile, this.baseUrl, this.updater.isAddNoCacheQuery)
    for (let attemptNumber = 0; ; attemptNumber++) {
      try {
        result = parseUpdateInfo(await this.httpRequest(channelUrl), channelFile, channelUrl)
        break
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

    if (isUseOldMacProvider()) {
      (result as any).releaseJsonUrl = channelUrl.href
    }
    return result
  }

  resolveFiles(updateInfo: UpdateInfo): Array<ResolvedUpdateFileInfo> {
    return resolveFiles(updateInfo, this.baseUrl)
  }
}