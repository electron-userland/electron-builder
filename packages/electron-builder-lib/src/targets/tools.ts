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
  return Promise.all([getAppImage(), fpmPath.value, getAppBuilderTool(), getSnapTemplate()])
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

export function getSnapTemplate() {
  // noinspection SpellCheckingInspection
  return getBinFromGithub("snap-template", "0.1.1", "W8JXQMwsrqH7T8kFD3KuULNVJRqygmcQPDPGhr9BXeRQS9U+A6jSsUEopQIwfQxlhuA6f7Jerc9XA0/ZLlK60w==")
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
    version: "0.6.1",
    "linux-armv7": "oDOrB1Cv65OkNF1+bLTpw50xG+C1p6wjbWEwYGR+WbQs6ScrqcN7bPbHrSW1t578d5Y+x/sU5PYrfpBJTE9I2w==",
    "linux-armv8": "f10m8QnQr7V2bf1rZnun+uGc1piZjYLZx2OWKyNwsL+IRpT0VCnTUpuL0TV4UJbw1QzPg/JdzGAKubRfuXaWMw==",
    "linux-ia32": "qb14V2GfUIZ64ytrJemW0tgcvyrOPzWfWJQ8SJ6O+MmXC+zNGFBR2FYxfTzGOeB9iaXZucdAImxBxCrqUwZgew==",
    "linux-x64": "xPYAnXx535ZSMktNwbvsV4U1BadXaad0LtVtQBoFJuuRUQFqyOImK5XBvnhRhac7Ufx1S1jLoVfTMocPWvKutw==",
    mac: "ONEM+jbw48kBkqFXkxHQiEXEjLtm0TWVqDEjw7X4SX5GKtejfAGus9efMBcghG9O2ooRqcj5PGtbpV65LQs5ug==",
    "win-ia32": "XHQRnsLhuu+O20wf24bKWHT4I8sXT5e16970guutZjqcAC07O6/wQk527R6DBSoGHe+71neUK/oYK6B23glrAw==",
    "win-x64": "m1kR07Nz0fHvwPHcfYnJvd8puQfh71qbLoySXJHNS88xyEZNKMJXOTlwjUbv2D05LpzrhgIbBZFH5GOedlCQpA==",
  })
}