import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { isUseSystemFpm } from "../util/flags.js"
import { getCustomToolsetPath } from "./custom.js"

export const fpmChecksums = {
  "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z": "2ef73acbcbfd26503369cb3a9b0345aa7fae251d69130537ee6ff47b402f828e",
  "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z": "50eff4214e3e30e2a8bbc35854f80acabb3260ea9e87f5835c60f898eedb320e",
  "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z": "553f047eacbc63423bae1eca5958bcdc720c1f6f4135cb815f5ec99f48d3bd55",
  "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z": "e44b60765367cd11b0b9fa5f1966762137ee45ec02d49a3e9668475031e97873",
  "fpm-1.17.0-ruby-3.4.3-linux-i386.7z": "f4091110728de8259dcab181761e74141b4b65d409a26e642c7271bd0b61eab4",
} as const

export function getFpmPlatformFile(): string {
  if (process.platform === "linux") {
    if (process.arch === "x64") {
      return "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z"
    }
    if (process.arch === "arm64") {
      return "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z"
    }
    return "fpm-1.17.0-ruby-3.4.3-linux-i386.7z"
  }
  if (process.arch === "arm64") {
    return "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z"
  }
  return "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z"
}

export async function getFpmPath(toolset: ToolsetConfig["fpm"], resourcesDir: string) {
  const exec = "fpm"
  if (process.platform === "win32" || isUseSystemFpm()) {
    return exec
  }

  if (typeof toolset === "object" && toolset != null) {
    const vendorPath = await getCustomToolsetPath(toolset, resourcesDir)
    return path.resolve(vendorPath, exec)
  }

  const filename = getFpmPlatformFile()
  const fpmPath = await downloadBuilderToolset({
    releaseName: `fpm@2.2.1`,
    filenameWithExt: filename,
    checksums: fpmChecksums,
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })
  return path.resolve(fpmPath, exec)
}
