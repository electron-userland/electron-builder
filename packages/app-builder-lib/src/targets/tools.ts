import * as path from "path"
import { getBinFromUrl } from "../binDownload"

export function getLinuxToolsPath() {
  return getBinFromUrl("linux-tools-mac-10.12.3", "linux-tools-mac-10.12.3.7z", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}

export async function getFpmPath() {
  if (process.env.CUSTOM_FPM_PATH != null) {
    return path.resolve(process.env.CUSTOM_FPM_PATH)
  }
  const exec = "fpm"
  if (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") {
    return exec
  }
  if (process.platform === "linux") {
    if (process.arch == "x64") {
      return path.join(
        await getBinFromUrl(
          "fpm@3.0.5",
          "fpm-1.16.0-ruby-3.4.3-linux-amd64.7z",
          "fwL0wTB5R2ILwieawK2jjPZf5IaxqXlRYrHlFnLeUcPz+Rz2IJqiZggzSQ7l4oJ3rWzYbMW3+WKOTNq6fod/cQ==",
          "mmaietta/electron-builder-binaries"
        ),
        exec
      )
    } else if (process.arch === "arm64") {
      return path.join(
        await getBinFromUrl(
          "fpm@3.0.5",
          "fpm-1.16.0-ruby-3.4.3-linux-arm64v8.7z",
          "05cQbF/JEjSvmYGQpRVY+Qaj4a4MCsbUlo4pFJmppMOMSHlyyCmSu3g96moM2N/Qv1QdFbZ+MJa+AgZSuO5CZQ==",
          "mmaietta/electron-builder-binaries"
        ),
        exec
      )
    }
    return path.join(
      await getBinFromUrl(
        "fpm@3.0.5",
        "fpm-1.16.0-ruby-3.4.3-linux-i386.7z",
        "n4KeDrQ7ruTTocHe/rQJ3v45yEBw6Pu2YXSmJAngF9rbcLr8BBUA/Khh1F/EtZvbf4wx0SAhlosYH+ImmdIoFw==",
        "mmaietta/electron-builder-binaries"
      ),
      exec
    )
  }
  // darwin arm64
  if (process.arch === "arm64") {
    return path.join(
      await getBinFromUrl(
        "fpm@3.0.5",
        "fpm-1.16.0-ruby-3.4.3-darwin-arm64.7z",
        "XaNjq4kxP2J/656ZqJ4GBk9cfhhFeY+ciB34qFL784ImJXN4q/0N4CWqJi0Dted9dMWKiKs9vDqLdOlW8gbT9A==",
        "mmaietta/electron-builder-binaries"
      ),
      exec
    )
  }
  // darwin x64
  return path.join(
    await getBinFromUrl(
      "fpm@3.0.5",
      "fpm-1.16.0-ruby-3.4.3-darwin-x86_64.7z",
      "lBGcgz+wPgEANuH0/+YVO7LMqaNRx1NrJP075qhNTyQru1JJdwZ2VhW0msXgQZGw9k/azv9stbkwVG4hWmZJxw==",
      "mmaietta/electron-builder-binaries"
    ),
    exec
  )
}
