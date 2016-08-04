import { EventEmitter } from "events"
import { app } from "electron"
import { spawn } from "child_process"
import * as path from "path"
import { tmpdir } from "os"

class NsisUpdater extends EventEmitter {
  private setupPath = path.join(tmpdir(), 'innobox-upgrade.exe')

  private updateAvailable = false
  private quitAndInstallCalled = false

  constructor(public updateUrl?: string) {
    super()
  }

  getFeedURL(): string | null | undefined {
    return this.updateUrl
  }

  setFeedURL(value: string) {
    this.updateUrl = value
  }

  checkForUpdates(): void {
    if (this.updateUrl == null) {
      this.emitError("Update URL is not set")
      return
    }

    this.emit("checking-for-update")
  }

  quitAndInstall(): void {
    if (!this.updateAvailable) {
      this.emitError("No update available, can't quit and install")
      return
    }

    if (this.quitAndInstallCalled) {
      return
    }

    // prevent calling several times
    this.quitAndInstallCalled = true

    spawn(this.setupPath, ["/S"], {
      detached: true,
      stdio: "ignore",
    }).unref()

    app.quit()
  }

  // emit both error object and message, this is to keep compatibility with old APIs
  private emitError (message: string) {
    return this.emit("error", new Error(message), message)
  }
}

const updater = new NsisUpdater()
export= updater