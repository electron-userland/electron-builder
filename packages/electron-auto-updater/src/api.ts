import { VersionInfo } from "electron-builder-http/out/publishOptions"
import { EventEmitter } from "events"
import { ProgressInfo } from "electron-builder-http"

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

export const DOWNLOAD_PROGRESS = "download-progress"

export class UpdaterSignal {
  constructor(private emitter: EventEmitter) {
  }

  progress(handler: (event: ProgressInfo) => void) {
    addHandler(this.emitter, DOWNLOAD_PROGRESS, handler)
  }
}

const isLogEvent = false

function addHandler(emitter: EventEmitter, event: string, handler: Function) {
  if (isLogEvent) {
    emitter.on(event, function (...args: any[]) {
      console.log("%s %s", event, args)
      handler.apply(this, args)
    })
  }
  else {
    emitter.on(event, handler)
  }
}