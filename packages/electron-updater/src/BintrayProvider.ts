import { Provider, FileInfo } from "./api"
import { BintrayClient } from "electron-builder-http/out/bintray"
import { BintrayOptions, VersionInfo } from "electron-builder-http/out/publishOptions"
import { HttpError } from "electron-builder-http"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"

export class BintrayProvider extends Provider<VersionInfo> {
  private client: BintrayClient

  constructor(configuration: BintrayOptions) {
    super()

    this.client = new BintrayClient(configuration, new CancellationToken())
  }

  async getLatestVersion(): Promise<VersionInfo> {
    try {
      const data = await this.client.getVersion("_latest")
      return {
        version: data.name,
      }
    }
    catch (e) {
      if ("response" in e && e.response.statusCode === 404) {
        throw new Error(`No latest version, please ensure that user, package and repository correctly configured. Or at least one version is published. ${e.stack || e.message}`)
      }
      throw e
    }
  }

  async getUpdateFile(versionInfo: VersionInfo): Promise<FileInfo> {
    try {
      const files = await this.client.getVersionFiles(versionInfo.version)
      const suffix = `${versionInfo.version}.exe`
      for (const file of files) {
        if (file.name.endsWith(suffix) && file.name.includes("Setup")) {
          return {
            name: file.name,
            url: `https://dl.bintray.com/${this.client.owner}/${this.client.repo}/${file.name}`,
            sha2: file.sha256,
          }
        }
      }

      //noinspection ExceptionCaughtLocallyJS
      throw new Error(`Cannot find suitable file for version ${versionInfo.version} in: ${JSON.stringify(files, null, 2)}`)
    }
    catch (e) {
      if (e instanceof HttpError && e.response.statusCode === 404) {
        throw new Error(`No latest version, please ensure that user, package and repository correctly configured. Or at least one version is published. ${e.stack || e.message}`)
      }
      throw e
    }
  }
}