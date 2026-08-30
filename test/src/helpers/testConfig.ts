import * as os from "os"
import * as path from "path"

export const ELECTRON_VERSION = "39.8.10"

// The default pacman `depends` list still contains "http-parser", which Arch Linux dropped from its
// official repositories (it is AUR-only now). Test builds pin an explicit list (the default minus
// http-parser) so installing the built .pacman inside a vanilla Arch container works without
// building AUR packages first.
export const PACMAN_TEST_DEPENDS = ["c-ares", "ffmpeg", "gtk3", "libevent", "libvpx", "libxslt", "libxss", "minizip", "nss", "re2", "snappy", "libnotify", "libappindicator-gtk3"]

export function getElectronCacheDir() {
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Cache", "electron")
  } else if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "electron")
  } else {
    return path.join(os.homedir(), ".cache", "electron")
  }
}
