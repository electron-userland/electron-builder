import * as path from "path"
import { homedir as getHomedir } from "os"

export interface AppAdapter {
  readonly version: string
  readonly name: string

  readonly isPackaged: boolean

  /**
   * Path to update metadata file.
   */
  readonly appUpdateConfigPath: string

  /**
   * Path to user data directory.
   */
  readonly userDataPath: string

  /**
   * Path to cache directory.
   */
  readonly baseCachePath: string

  whenReady(): Promise<void>

  quit(): void

  onQuit(handler: (exitCode: number) => void): void
}

export function getAppCacheDir() {
  const homedir = getHomedir()
  // https://github.com/electron/electron/issues/1404#issuecomment-194391247
  let result: string
  if (process.platform === "win32") {
    result = process.env["LOCALAPPDATA"] || path.join(homedir, "AppData", "Local")
  } else if (process.platform === "darwin") {
    result = path.join(homedir, "Library", "Caches")
  } else {
    result = process.env["XDG_CACHE_HOME"] || path.join(homedir, ".cache")
  }
  return result
}
