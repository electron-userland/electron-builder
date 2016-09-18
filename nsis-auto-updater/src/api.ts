export interface VersionInfo {
  readonly version: string
}

export interface FileInfo {
  name: string

  url: string
}

export interface Provider {
  getLatestVersion(): Promise<VersionInfo>

  getUpdateFile(versionInfo: VersionInfo): Promise<FileInfo>
}

export interface UpdateCheckResult {
  readonly versionInfo: VersionInfo
  readonly fileInfo?: FileInfo

  readonly downloadPromise?: Promise<any> | null
}