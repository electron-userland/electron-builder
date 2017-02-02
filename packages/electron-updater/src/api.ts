import { VersionInfo } from "electron-builder-http/out/publishOptions"
import { EventEmitter } from "events"
import { RequestHeaders } from "electron-builder-http"
import { ProgressInfo } from "electron-builder-http/out/ProgressCallbackTransform"

export interface FileInfo {
  readonly name: string
  readonly url: string
  readonly sha2?: string
}

export abstract class Provider<T extends VersionInfo> {
  protected requestHeaders: RequestHeaders | null

  setRequestHeaders(value: RequestHeaders | null) {
    this.requestHeaders = value
  }

  abstract getLatestVersion(): Promise<T>

  abstract getUpdateFile(versionInfo: T): Promise<FileInfo>
}

// due to historical reasons for windows we use channel name without platform specifier
export function getDefaultChannelName() {
  let channel = "latest"
  if (getCurrentPlatform() === "darwin") {
    channel += "-mac"
  }
  return channel
}

export function getCustomChannelName(channel: string) {
  return `${channel}${(getCurrentPlatform()) === "darwin" ? "-mac" : ""}`
}

export function getCurrentPlatform () {
  return process.env.TEST_UPDATER_PLATFORM || process.platform
}

export function getChannelFilename(channel: string) {
  return `${channel}.${(getCurrentPlatform()) === "darwin" ? "json" : "yml"}`
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

  progress(handler: (info: ProgressInfo) => void) {
    addHandler(this.emitter, DOWNLOAD_PROGRESS, handler)
  }

  updateDownloaded(handler: (info: VersionInfo) => void) {
    addHandler(this.emitter, "update-downloaded", handler)
  }
}

const isLogEvent = false

function addHandler(emitter: EventEmitter, event: string, handler: Function) {
  if (isLogEvent) {
    emitter.on(event, function (...args: any[]) {
      console.log("%s %s", event, args)
      handler.apply(null, args)
    })
  }
  else {
    emitter.on(event, handler)
  }
}