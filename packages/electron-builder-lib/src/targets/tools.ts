import { getBin, getBinFromGithub } from "builder-util/out/binDownload"
import { Lazy } from "lazy-val"
import * as path from "path"
import { Platform } from "../core"

export function getLinuxToolsPath() {
  //noinspection SpellCheckingInspection
  return getBinFromGithub("linux-tools", "mac-10.12.3", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}

export const fpmPath = new Lazy(() => {
  if (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") {
    return Promise.resolve("fpm")
  }

  const osAndArch = process.platform === "darwin" ? "mac" : `linux-x86${process.arch === "ia32" ? "" : "_64"}`

  if (process.platform === "darwin") {
    //noinspection SpellCheckingInspection
    return getBinFromGithub("fpm", "1.9.3-20150715-2.2.2-mac", "oXfq+0H2SbdrbMik07mYloAZ8uHrmf6IJk+Q3P1kwywuZnKTXSaaeZUJNlWoVpRDWNu537YxxpBQWuTcF+6xfw==")
      .then(it => path.join(it, "fpm"))
  }

  //noinspection SpellCheckingInspection
  const checksum = process.arch === "ia32" ? "OnzvBdsHE5djcXcAT87rwbnZwS789ZAd2ehuIO42JWtBAHNzXKxV4o/24XFX5No4DJWGO2YSGQttW+zn7d/4rQ==" : "fcKdXPJSso3xFs5JyIJHG1TfHIRTGDP0xhSBGZl7pPZlz4/TJ4rD/q3wtO/uaBBYeX0qFFQAFjgu1uJ6HLHghA=="
  return getBinFromGithub("fpm", `1.9.3-2.3.1-${osAndArch}`, checksum)
    .then(it => path.join(it, "fpm"))
})

// noinspection JSUnusedGlobalSymbols
export function prefetchBuildTools(): Promise<any> {
  // yes, we starting to use native Promise
  return fpmPath.value
}

export function getZstd() {
  // noinspection SpellCheckingInspection
  return getTool({
    name: "zstd",
    version: "1.3.4",
    mac: "pLrLk2FAkop3C2drZ7+oxyGPQJjNMzUmVf0m3ZCc1a3WIEjYJNpq9UYvfBU/dl2CsRAchlKvoIOWRxRIdX0ugA==",
    "linux-x64": "C1TcuuN/0nNvHMwfkKmE8rgsDxkeSbGoV4DMSf4kIJIO4mNp+PUayYeBf4h3usScsWfvX70Jvg5v3yt1FySTDg==",
    "win-ia32": "URJhIibWZUEy9USYlHBjc6bgEp7KP+hMJl/YWsssMTt6umxgk+niyc5meKs2XwOwBsvK6KsP+Qr/BawK7CdWVQ==",
    "win-x64": "S4RtWJwccUQfr/UQeZuWTJyJvU5uaYaP3rGT6e55epuAJx+fuljbJTBw+n8da0oRLIw0essEjGHkNafWgmKt1w==",
  })
}

export interface ToolDescriptor {
  name: string
  version: string

  repository?: string

  mac: string
  "linux-ia32"?: string
  "linux-x64"?: string
  "linux-armv7"?: string
  "linux-armv8"?: string

  "win-ia32": string
  "win-x64": string
}

export function getTool(descriptor: ToolDescriptor): Promise<string> {
  let arch = process.arch
  if (arch === "arm") {
    arch = "armv7"
  }
  else if (arch === "arm64") {
    arch = "armv8"
  }

  const platform = Platform.current()
  const checksum = platform === Platform.MAC ? descriptor.mac : (descriptor as any)[`${platform.buildConfigurationKey}-${arch}`]
  if (checksum == null) {
    throw new Error(`Checksum not specified for ${platform}:${arch}`)
  }

  const archQualifier = platform === Platform.MAC ? "" : `-${arch}`

  // https://github.com/develar/block-map-builder/releases/download/v0.0.1/block-map-builder-v0.0.1-win-x64.7z
  const version = descriptor.version
  const name = descriptor.name
  const repository = descriptor.repository || "electron-userland/electron-builder-binaries"
  const tagPrefix = descriptor.repository == null ? `${name}-` : "v"
  return getBin(`${name}-${version}-${process.arch}`, `https://github.com/${repository}/releases/download/${tagPrefix}${version}/${name}-v${version}-${platform.buildConfigurationKey}${archQualifier}.7z`, checksum)
    .then(it => path.join(it, `${name}${platform === Platform.WINDOWS ? ".exe" : ""}`))
}