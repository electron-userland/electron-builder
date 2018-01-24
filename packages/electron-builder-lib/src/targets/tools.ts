import BluebirdPromise from "bluebird-lst"
import { isEnvTrue } from "builder-util"
import { getBin, getBinFromGithub } from "builder-util/out/binDownload"
import { Lazy } from "lazy-val"
import * as path from "path"
import { Platform } from "../core"

export function getLinuxToolsPath() {
  //noinspection SpellCheckingInspection
  return getBinFromGithub("linux-tools", "mac-10.12.3", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}

export function getAppImage() {
  //noinspection SpellCheckingInspection
  return getBinFromGithub("appimage", "9.0.5", "AZbiBSeyow/pKCzeyIwVtogIUSWD4GxAxkqwL9GQcL1vq+EhcNPeMKOdlSI045SU4pknU4ceLwO5tzV7o0tNOw==")
}

export const fpmPath = new Lazy(() => {
  if (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") {
    return BluebirdPromise.resolve("fpm")
  }

  const osAndArch = process.platform === "darwin" ? "mac" : `linux-x86${process.arch === "ia32" ? "" : "_64"}`

  if (process.platform === "darwin") {
    //noinspection SpellCheckingInspection
    return getBinFromGithub("fpm", "1.9.2.1-20150715-2.2.2-mac", "6sZZoRKkxdmv3a6E5dnZgVl23apGnImhDtGHKhgCE1WOtXBUJnx+w0WvB2HD2/sitz4f93Mf7+QqDCIbfP7LOw==")
      .then(it => path.join(it, "fpm"))
  }

  //noinspection SpellCheckingInspection
  const checksum = process.arch === "ia32" ? "cTT/HdjrQ6qTJQhTZaZC3lyDkRCyNFtNBZ0F7n6mh5B3YmD5ttJZ0xn65pQS03dhEi67A8K1xXNO+tyEEviiIg==" : "0zKxWlHuQEUsXJpWll5Bc4OTI8d0jcMVlme9OeHI+Y+s3sv1S4KyGLOEVEkNw6pRU8F+A1Dj5IR95/+U8YzB0A=="
  return getBinFromGithub("fpm", `1.9.2-2.3.1-${osAndArch}`, checksum)
    .then(it => path.join(it, "fpm"))
})

// noinspection JSUnusedGlobalSymbols
export function prefetchBuildTools() {
  // yes, we starting to use native Promise
  return Promise.all([getAppImage(), fpmPath.value, getAppBuilderTool()])
}

export function getZstd() {
  // noinspection SpellCheckingInspection
  return getTool({
    name: "zstd",
    version: "1.3.3",
    mac: "RnFYU+gEieQFCu943WEmh++PT5TZjDSqSCZvZj7ArfVkc+JS+DdGi30/466gqx9VFKsk6XpYrCpZNryFSvDOuw==",
    "linux-x64": "M1YpBtWX9C99hwRHF8bOLdN5bUFChMwWRc/NzGSwG48VVtegEV2RCFqbT1v0ZcSLC54muhOtK1VgMEmTKr0ouQ==",
    "win-ia32": "uUG8l+JQZtgFOq5G9lg3ryABiFA2gv14inJTAmpprywmbVfCVe++ikzJcjg5ZdLKhYDcB3nIsKE5c7pWY7+1yA==",
    "win-x64": "lBCx8nuRkEu8oQqgXosuO9e35BQOSyugFaK5ExBiTKh6qkv6amsYEUNELZGmEqH+FXscagxq+7+QUYkWJfmROQ==",
  })
}

export function getAria() {
  const platform = Platform.current()
  const archQualifier = platform === Platform.MAC ? "" : `-${process.arch}`

  let checksum = ""
  if (platform === Platform.MAC) {
    // noinspection SpellCheckingInspection
    checksum = "UjstpQUAtoP/sZ9SNuWwIN1WyDfvr1V3bzLGzTZCt1IqQsf9YwBSo0jrXMMRZOqv1sy5EOvp5nyC4VvJZCRVuQ=="
  }
  else if (platform === Platform.WINDOWS) {
    // noinspection SpellCheckingInspection
    checksum = process.arch === "ia32" ?
      "aulZig14OCHqj5qUWDvIAacibzW9k+gfDGDeECzWDrF7FPYzI+Vn7Q7QnW/FXNyNnbe8PeYawTlGzD3vJxLQWg==" :
      "zksKH0Uazwtc/vfGSVy+tzsNou+thSamAGTKt8P1DLoNkdSz9ueaIFoJ7jt8jlDds8Z6Rrxls6IFkZRBDxiyfg=="
  }

  //noinspection SpellCheckingInspection
  return getBinFromGithub(`aria2-${platform.buildConfigurationKey}${archQualifier}`, "1.33.1", checksum)
    .then(it => path.join(it, `aria2c${platform === Platform.WINDOWS ? ".exe" : ""}`))
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
  return getBin(name, `${name}-v${version}-${process.arch}`, `https://github.com/${repository}/releases/download/${tagPrefix}${version}/${name}-v${version}-${platform.buildConfigurationKey}${archQualifier}.7z`, checksum)
    .then(it => path.join(it, `${name}${platform === Platform.WINDOWS ? ".exe" : ""}`))
}

export function getAppBuilderTool() {
  if (isEnvTrue(process.env.USE_SYSTEM_AB)) {
    return Promise.resolve("app-builder")
  }

  // noinspection SpellCheckingInspection
  return getTool({
    repository: "develar/app-builder",
    name: "app-builder",
    version: "0.6.0",
    mac: "d27p1TYhPVlWFS+3TO8dh80sHP5imMnZTS04ODvL9xHpCQ7KZEUqFEWYi7zDFXKfzBU6zwBcRGrb8BwQAawvzg==",
    "linux-ia32": "1aLAsDliV/kCYfOQR/NX43pRwO/v4nC7F98Z9ZRO8r8iXEpTLYVJC19FNup81WpD0hvxLBspnbq73YiSE3aX8g==",
    "linux-x64": "6iu/0BzEKTIuCZ/pVPorpLTXjTzqcquTfrlyB9mEyPXQcHPTueK+tBBDQ6SIO7eaGq+W3PDe1oEjgiz2q3Zd4g==",
    "linux-armv7": "zUxn5fAxeGylF7mqVP+Aaas3vD3ITTS26EBty9VkGz51EYgCVYnQVTacDIQjwB6s1zit6jt8EJy5Jj0Y+6U+7w==",
    "linux-armv8": "69napXVwaPqQcNp7tozNyo7VJbB90E2RToN0pqGppdfUBzTLJUNnZL5D7H4MoUUPS/WgNRalEswb7GfZOsK4XA==",
    "win-ia32": "HW+pZS96d0v96iq0y8BX4vg5J97oFMujPaqziatRNZif26EI75lS5S58qCEmooyr9lXDLwbIlNIhrKg7ZzlNhw==",
    "win-x64": "eO8eJq2N/t0/3g3EuRut0LU460WUqzywiRhr+OjEUQH1Gt7GuIdc4gYOfDazYjyeTqlATCfT/OzQMdplaac2wQ==",
  })
}