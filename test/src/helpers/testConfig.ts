import * as os from "os"
import * as path from "path"

export const ELECTRON_VERSION = "42.4.0"

// Shared by every test worker process (see PackagerOptions.electronUnpackCacheDir). Deliberately outside the electron-builder cache directory,
// which CI saves as a cache snapshot whenever it gains files: the unpacked Electron trees would bloat every snapshot.
export const ELECTRON_UNPACK_CACHE_DIR = path.join(os.tmpdir(), "electron-builder-test-electron-unpack-cache")

// Test builds pin an explicit pacman `depends` list so installing the built .pacman inside a
// vanilla Arch container works regardless of what the library's default depends list contains
// (every entry here resolves from the official Arch repositories).
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
