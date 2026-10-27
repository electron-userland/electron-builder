import * as path from "path"
import { homedir as getHomedir } from "os"

/** A quit that can still be cancelled, see {@link AppAdapter.onWillQuit}. */
export interface CancellableQuitEvent {
  /** Cancels the quit: the app keeps running. */
  preventDefault(): void
  /**
   * Whether the quit is cancelled already, by {@link preventDefault} called from this or another handler of the same
   * quit (Electron's `event.defaultPrevented`). An adapter that cannot tell reports `false`.
   */
  readonly defaultPrevented: boolean
}

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

  relaunch(): void

  quit(): void

  onQuit(handler: (exitCode: number) => void): void

  /**
   * Called on every quit (`app.quit()`, the quit after the last window closed, the app menu), once all windows have
   * closed and before {@link onQuit}; `event.preventDefault()` cancels that quit (Electron's `will-quit`). Not called
   * for `app.exit()`. All handlers of a quit get the same event, so `event.defaultPrevented` tells whether one that ran
   * earlier cancelled it. Optional: without it, an install on quit cannot cancel the quit when it fails.
   */
  onWillQuit?(handler: (event: CancellableQuitEvent) => void): void

  /**
   * Best-effort notification that the OS session is ending (shutdown / reboot / log off).
   * Optional because not every adapter (or platform) can detect it.
   */
  onSessionEnd?(handler: () => void): void
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
