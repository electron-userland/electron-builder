import * as path from "path"
import { getBinFromUrl } from "../binDownload.js"

export function getLinuxToolsPath() {
  return getBinFromUrl("linux-tools-mac-10.12.3", "linux-tools-mac-10.12.3.7z", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}

export async function getFpmPath() {
  // It's just easier to copy the map of checksums here rather then adding them to within each if-statement. Also, easy copy-paste from the releases page
  const fpmChecksumMap = {
    "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z": "0n3BG/Xz1T5YIsoNNTG1bBege9E8A7rym5e3mfzHSHbiSiTS44v6GIHW4amDQk1Y5dtKtWXVq7FwjdmAf3kmMg==",
    "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z": "wPX3UheBznIlAXduM22W/d27i+DZVIB/MYnY5eh/qLeEEASZqHJWgN+pIckz3jT0dP37g1SQCikXXfsgxtMSPA==",
    "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z": "7miGWr6dfJSzXDD9ALqkwxvGACp7s7GR50NPcU0YwzbJL825H1SLwGJSGME+v57BxDI2xac47gFEkRZf5u9EtA==",
    "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z": "moRNjg6Q2iSXpkrm5sGNL2F6KilGNPagbefxhtr3VEqvAUSg2k2pMLr5xXUo0L4rZ4V+uETbwmbDCpeO3pmLyQ==",
    "fpm-1.17.0-ruby-3.4.3-linux-i386.7z": "UPzsXhkW2T7+oHSKgFsZsFUxxmPC9lNZHsQbT+OeoTbIGsb6+qf3m7c6uP0XvRFnJiu3MM3lE1xAWQOctvajWA==",
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
  const fpmPath = await getBinFromUrl("fpm@2.1.4", filename, fpmChecksumMap[filename])
  return path.join(fpmPath, exec)
}
