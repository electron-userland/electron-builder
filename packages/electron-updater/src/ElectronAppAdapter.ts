import { createRequire } from "node:module"
import * as path from "path"
<<<<<<< HEAD
<<<<<<< HEAD

const require = createRequire(import.meta.url)
import { AppAdapter, getAppCacheDir } from "./AppAdapter.js"
=======
import { AppAdapter, getAppCacheDir } from "./AppAdapter.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)
=======
import { AppAdapter, getAppCacheDir } from "./AppAdapter.js"
>>>>>>> c92b22265 (tmp save for .js extension migration)

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

  onQuit(handler: (exitCode: number) => void): void {
    this.app.once("quit", (_: Electron.Event, exitCode: number) => handler(exitCode))
  }
}
