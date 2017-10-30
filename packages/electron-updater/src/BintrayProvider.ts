import { BintrayOptions, CancellationToken, HttpError, HttpExecutor, UpdateInfo } from "builder-util-runtime"
import { BintrayClient } from "builder-util-runtime/out/bintray"
import { FileInfo, getChannelFilename, getDefaultChannelName, Provider } from "./main"
import { URL } from "url"
import { getUpdateFileUrl, parseUpdateInfo } from "./Provider"

export class BintrayProvider extends Provider<UpdateInfo> {
  private client: BintrayClient

  setRequestHeaders(value: any): void {
    super.setRequestHeaders(value)
    this.client.setRequestHeaders(value)
  }

  constructor(configuration: BintrayOptions, httpExecutor: HttpExecutor<any>) {
    super(httpExecutor)

    this.client = new BintrayClient(configuration, httpExecutor, new CancellationToken())
  }

  async getLatestVersion(): Promise<UpdateInfo> {
    try {
      const data = await this.client.getVersion("_latest")
      const channelFilename = getChannelFilename(getDefaultChannelName())
      const files = await this.client.getVersionFiles(data.name)
      const channelFile = files.find(it => it.name.endsWith(`_${channelFilename}`))
      if (channelFile == null) {
        return {
          version: data.name,
        } as any
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

  async getUpdateFile(updateInfo: UpdateInfo): Promise<FileInfo> {
    try {
      let fileUrl: string
      let sha256: string | undefined
      if ("url" in updateInfo || "path" in updateInfo) {
        fileUrl = getUpdateFileUrl(updateInfo)
      }
      else {
        const files = await this.client.getVersionFiles(updateInfo.version)
        const suffix = `${updateInfo.version}.exe`
        const file = files.find(it => it.name.endsWith(suffix) && it.name.includes("Setup")) || files.find(it => it.name.endsWith(suffix)) || files.find(it => it.name.endsWith(".exe"))
        if (file == null) {
          //noinspection ExceptionCaughtLocallyJS
          throw new Error(`Cannot find suitable file for version ${updateInfo.version} in: ${JSON.stringify(files, null, 2)}`)
        }

        fileUrl = `https://dl.bintray.com/${this.client.owner}/${this.client.repo}/${file.name}`
        sha256 = file.sha256
      }

      return {
        url: fileUrl,
        sha2: sha256 ,
        sha512: updateInfo.sha512,
      }
    }
    catch (e) {
      if (e instanceof HttpError && e.response.statusCode === 404) {
        throw new Error(`No latest version, please ensure that user, package and repository correctly configured. Or at least one version is published. ${e.stack || e.message}`)
      }
      throw e
    }
  }
}