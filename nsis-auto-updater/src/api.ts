import { VersionInfo } from "../../src/options/publishOptions"

export interface FileInfo {
  name: string

  url: string

  sha2?: string
}

export interface Provider<T extends VersionInfo> {
  getLatestVersion(): Promise<T>

  getUpdateFile(versionInfo: T): Promise<FileInfo>
}

export interface UpdateCheckResult {
  readonly versionInfo: VersionInfo
  readonly fileInfo?: FileInfo

  readonly downloadPromise?: Promise<any> | null
}