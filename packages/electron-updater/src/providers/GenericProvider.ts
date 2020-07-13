import { GenericServerOptions, UpdateInfo } from "builder-util-runtime"
import { AppUpdater } from "../AppUpdater"
import { newBaseUrl, Provider, ResolvedUpdateFileInfo } from "../main"
import { getGenericLatestVersion, ProviderRuntimeOptions, resolveFiles } from "./Provider"

export class GenericProvider extends Provider<UpdateInfo> {
  private readonly baseUrl = newBaseUrl(this.configuration.url)

  constructor(protected readonly configuration: GenericServerOptions, protected readonly updater: AppUpdater, runtimeOptions: ProviderRuntimeOptions) {
    super(runtimeOptions)
  }

  private get channel(): string {
    const result = this.updater.channel || this.configuration.channel
    return result == null ? this.getDefaultChannelName() : this.getCustomChannelName(result)
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    return getGenericLatestVersion(this, this.channel, this.baseUrl);
  }

  resolveFiles(updateInfo: UpdateInfo): Array<ResolvedUpdateFileInfo> {
    return resolveFiles(updateInfo, this.baseUrl)
  }
}