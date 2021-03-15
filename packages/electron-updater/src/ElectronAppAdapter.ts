import * as path from "path"
import { AppAdapter, getAppCacheDir } from "./AppAdapter"

export class ElectronAppAdapter implements AppAdapter {
  constructor(private readonly app = require("electron").app) {}

  whenReady(): Promise<void> {
    return this.app.whenReady()
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
    return this.isPackaged ? path.join(process.resourcesPath!, "app-update.yml") : path.join(this.app.getAppPath(), "dev-app-update.yml")
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

  onQuit(handler: (exitCode: number) => void): void {
    this.app.once("quit", (_: Event, exitCode: number) => handler(exitCode))
  }
}
