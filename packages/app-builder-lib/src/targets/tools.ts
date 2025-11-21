import * as path from "path"
import { getBinFromUrl } from "../binDownload"

export function getLinuxToolsPath() {
  return getBinFromUrl("linux-tools-mac-10.12.3", "linux-tools-mac-10.12.3.7z", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}

export async function getFpmPath() {
  // It's just easier to copy the map of checksums here rather then adding them to within each if-statement. Also, easy copy-paste from the releases page
  const fpmChecksumMap = {
    "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z": "mjZzoFNW5ujEeJbtztR0l68a41a7aF8JwloL00X7XLnXHg7jKue224in+gyoTQraJYJSKGpWdJbHlEcrS9SNiQ==",
    "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z": "3q35ppdceHqwMTPv7kmWtiF7bRlKyQgb6AVuhkQDT/MgdbkRgqZtGuQuGwyk8YyhlU2Onutq1P2DEKjCREV6aQ==",
    "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z": "/O7C7upuHT4GAKhsw8Lj4NbLGf4/pQvWR0qizryT3lqK6omgZcRdhSdUAjq5L1HP2u1wteC5yv+Ite8cUXjUfg==",
    "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z": "XNnPHXT0G2IGQlVRJqUse/2GNpMlmdAQXhxlbIkd29O5QbTIifxGsloNHc5oXShRZDEnczR1nMnFa0EzWJDi1g==",
    "fpm-1.17.0-ruby-3.4.3-linux-i386.7z": "qOXxXDkD+/qS+Xs+MgQWY6jOtUTD71dieXXPhsbMpbexddNgw3QGsIDSdduWt8qHECLQ8rHpBJtHwUWVIrcPGA==",
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
  const fpmPath = await getBinFromUrl("fpm@2.1.3", filename, fpmChecksumMap[filename])
  return path.join(fpmPath, exec)
}
