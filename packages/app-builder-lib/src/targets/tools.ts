import * as path from "path"
import { getBinFromUrl } from "../binDownload"

export function getLinuxToolsPath() {
  return getBinFromUrl("linux-tools-mac-10.12.3", "linux-tools-mac-10.12.3.7z", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}

export async function getFpmPath() {
  // It's just easier to copy the map of checksums here rather then adding them to within each if-statement
  const fpmChecksumMap = {
"fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z": "iUZoNAvPSDBZE7y5Vj/XMzX90eU/+UV7yHbp+PZJSD2/s0a1fUGK+VMWpXRp5vlsnJRESObL3xtG5Y6blpc6yQ==",
"fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z": "AsRfASDMMohAlwVLeSjW+F+yu56ARc61D7P0E2rRD0bW0zB5AUG9szqjAl4QxqOaSacZ7EL1+TelWyIDidhtRQ==",
"fpm-1.17.0-ruby-3.4.3-linux-amd64.7z": "2QuPutLg0Ry3UNOkaY5Ps3s0IGhBPbuzEHY/KtwVef5bNtuqZUdQANqR/expQYA8gaAR8/TOJL+gaL1srkUlww==",
"fpm-1.17.0-ruby-3.4.3-linux-i386.7z": "30asREOfW0ZBleWzH7TfgYpQkH/05j4nJVgWYCZOrbAx35w5aPrVWLP6FR0UkFBn0vYXQjPoILyZyhy0K2GQkw==",
  }

  if (process.env.CUSTOM_FPM_PATH != null) {
    return path.resolve(process.env.CUSTOM_FPM_PATH)
  }
  const exec = "fpm"
  if (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") {
    return exec
  }
  const getKey = () => {
    if (process.platform === "linux") {
      if (process.arch !== "ia32") {
        return "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z"
      // } else if (process.arch === "arm64") {
      //   return "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z"
      }
      return "fpm-1.17.0-ruby-3.4.3-linux-i386.7z"
    }
    // darwin arm64
    if (process.arch === "arm64") {
      return "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z"
    }
    return "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z"
  }

  const filename = getKey()
  const fpmPath = await getBinFromUrl("fpm@2.1.0", filename, fpmChecksumMap[filename], "mmaietta/electron-builder-binaries")
  return path.join(fpmPath, exec)
}
