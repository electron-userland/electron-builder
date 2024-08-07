import * as path from "path"
import { AppAdapter, getAppCacheDir } from "./AppAdapter"

export class ElectronAppAdapter implements AppAdapter {
  private app: Electron.App

  constructor(private readonly electron = require("electron")) {
    this.app = this.electron.app
  }

  whenReady(): Promise<void> {
    return this.app.whenReady()
  }

  private closeAllWindows(): void {
    const windows: Electron.BrowserWindow[] = this.electron.BrowserWindow.getAllWindows()
    windows.forEach(window => window.close())
  }

  get version(): string {
    return this.app.getVersion()
  }

  get name(): string {
    return this.app.getName()
  }

  get isPackaged(): boolean {
    return this.app.isPackaged === true
  }

  get appUpdateConfigPath(): string {
    return this.isPackaged ? path.join(process.resourcesPath, "app-update.yml") : path.join(this.app.getAppPath(), "dev-app-update.yml")
  }

  get userDataPath(): string {
    return this.app.getPath("userData")
  }

  get baseCachePath(): string {
    return getAppCacheDir()
  }

  quit(): void {
    this.app.quit()
  }

  relaunch(): void {
    this.app.relaunch()
  }

  onQuit(handler: () => Promise<void>): void {
    this.app.once("before-quit", async (event: Electron.Event) => {
      // prevent quitting
      event.preventDefault()
      // Close all windows before quitting
      this.closeAllWindows()
      // show notification that update is starting
      new this.electron.Notification({
        title: `${this.app.name} is now updating`,
        body: `Please don't force quit the app as it might lead to corruption.`,
      }).show()

      try {
        // handle auto update
        await handler()
      } catch (error) {
        console.error(`Error during onQuit handler: ${error}`)
      }

      // resume quit after handler completes
      this.app.quit()
    })
  }
}
