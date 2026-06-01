import { resolveEnvToolsetPath } from "builder-util"
import * as path from "path"
import { getBinFromUrl } from "../binDownload"

const fpmChecksums = {
  "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z": "6cc6d4785875bc7d79bdf52ca146080a4c300e1d663376ae79615fb548030ede",
  "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z": "f7cb468c5e64177124c9d3a5f400ac20ffcb411aa5aa0ea224a808ff5a2d3bbf",
  "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z": "44b0ec6025c14ec137f56180e62675c0eae36233cdce53d0953d9c73ced8989f",
  "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z": "338b50cfa7f12d745a997d1a3d000bcd0410008050fa7d8c4476a78a61c0564e",
  "fpm-1.17.0-ruby-3.4.3-linux-i386.7z": "181124e2e9856855c21229ea9096bb7006a9e3e712d133ce332597ba878cd7b6",
} as const

export async function getFpmPath() {
  const customFpmPath = await resolveEnvToolsetPath("CUSTOM_FPM_PATH", "file")
  if (customFpmPath != null) {
    return customFpmPath
  }
  const exec = "fpm"
  if (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") {
    return exec
  }
  const getKey = () => {
    if (process.platform === "linux") {
      if (process.arch == "x64") {
        return "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z"
      } else if (process.arch === "arm64") {
        return "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z"
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
  const fpmPath = await getBinFromUrl("fpm@2.1.4", filename, fpmChecksums[filename])
  return path.join(fpmPath, exec)
}
