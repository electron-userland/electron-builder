import { AutoUpdater } from "electron"
import { ElectronAppAdapter } from "electron-updater"

// do not implement AppAdapter directly, test that our ElectronAppAdapter implementation is correct
export class TestAppAdapter extends ElectronAppAdapter {
  constructor(
    version: string,
    private _baseCachePath: string,
    nativeUpdater: AutoUpdater
  ) {
    super(new MockApp(version) as any, nativeUpdater)
  }

  get baseCachePath(): string {
    return this._baseCachePath
  }

  get userDataPath(): string {
    // use cache as user data in tests (only staging id is stored under user data)
    return this._baseCachePath
  }

  get isPackaged(): boolean {
    return true
  }

  whenReady(): Promise<void> {
    return Promise.resolve()
  }

  quit(): void {
    // empty
  }
}

class MockApp {
  constructor(private readonly version: string) {}

  // noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
  getVersion() {
    return this.version
  }

  getName() {
    return "test-updater-app"
  }

  // noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
  getAppPath() {
    return ""
  }

  // noinspection JSMethodCanBeStatic,JSUnusedGlobalSymbols
  getPath(type: string) {
    throw new Error("must be not called")
  }

  on() {
    // ignored
  }

  once() {
    // ignored
  }

  isReady() {
    return true
  }
}
