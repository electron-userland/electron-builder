import * as os from "os"
import * as path from "path"

export const ELECTRON_VERSION = "8.2.5"

export function getElectronCacheDir() {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Cache", "electron")
  }
  else if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "electron")
  }
  else {
    return path.join(os.homedir(), ".cache", "electron")
  }
}
