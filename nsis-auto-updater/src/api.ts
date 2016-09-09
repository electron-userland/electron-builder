export interface VersionInfo {
  readonly version: string
}
export interface FileInfo {
  url: string
}

export interface Provider {
  getLatestVersion(): Promise<VersionInfo>

  getUpdateFile(versionInfo: VersionInfo): Promise<FileInfo>
}

export interface UpdateCheckResult {
  readonly versionInfo: VersionInfo

  readonly downloadPromise?: Promise<any> | null
}