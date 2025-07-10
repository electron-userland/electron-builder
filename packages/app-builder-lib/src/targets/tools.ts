import * as path from "path"
import { getBinFromUrl } from "../binDownload"

export function getLinuxToolsPath() {
  return getBinFromUrl("linux-tools-mac-10.12.3", "linux-tools-mac-10.12.3.7z", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}

export async function getFpmPath() {
  // It's just easier to copy the map of checksums here rather then adding them to within each if-statement
  const fpmChecksumMap = {
    "fpm-1.16.0-ruby-3.4.3-darwin-arm64.7z": "xAyOUp213DnD5zN3o53L2sRs+OgoMYRVy2tOIhgsUdxcJUMzfy6U5Nrd92ZXUn5AHW3Y87CXPqwsL0aQaBTnBg==",
    "fpm-1.16.0-ruby-3.4.3-darwin-x86_64.7z": "WWdGdSOemjuQateF0qWkiWF9sgLgm8NNDnnWJe9CQ7l9+tVw1/tAGKH32/kTeaANVaDZg1r2Jq0uxudGEPYOuw==",
    "fpm-1.16.0-ruby-3.4.3-linux-amd64.7z": "zN/lxd0tUJi/QmjOmUQt91OaJbO+cSGxYmse7xh4BVXE4MY5TgUHUR+TqmEgBDofHqtR7G2V0OenYlr25ZWY2A==",
    "fpm-1.16.0-ruby-3.4.3-linux-arm64v8.7z": "WfC0mi3PI9DYwXZdkg2gwFttHGJn8uAZlNVWs0xYMkGNTpEunP25hdBltg0YXrVdVWEQhpjCU3if5F03B8jfcw==",
    "fpm-1.16.0-ruby-3.4.3-linux-i386.7z": "0qkId/DmyKc7fOQQN5pTe2gB+CfsJArmRGH+1f4KmFrNbfXQRl2G0c5NNEjSiqjqu+WhpOaKVWpHAskLD5iSzA==",
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
      if (process.arch == "x64") {
        return "fpm-1.16.0-ruby-3.4.3-linux-amd64.7z"
      } else if (process.arch === "arm64") {
        return "fpm-1.16.0-ruby-3.4.3-linux-arm64v8.7z"
      }
      return "fpm-1.16.0-ruby-3.4.3-linux-i386.7z"
    }
    // darwin arm64
    if (process.arch === "arm64") {
      return "fpm-1.16.0-ruby-3.4.3-darwin-arm64.7z"
    }
    return "fpm-1.16.0-ruby-3.4.3-darwin-x86_64.7z"
  }

  const filename = getKey()
  const fpmPath = await getBinFromUrl("fpm@2.0.1", filename, fpmChecksumMap[filename])
  return path.join(fpmPath, exec)
}
