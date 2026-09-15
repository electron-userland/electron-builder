import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { getCustomToolsetPath } from "./custom.js"
import { resolveToolsetVersion } from "./version.js"

// Newest linux-tools-mac bundle — selected when the config is unset / null / "latest".
const LINUX_TOOLS_MAC_LATEST = "1.0.1"

// no legacy toolset as macos arm64 BSD gtar/ar/lzip are not compatible with linux targets, so we always use newer toolset on macos for linux archives
const linuxToolsMacChecksums = {
  // built against macOS 26 — binaries abort on older hosts (see https://github.com/electron-userland/electron-builder/issues/10084)
  "1.0.0": {
    "linux-tools-mac-darwin-arm64.tar.gz": "204e76f08364352edb28a6a4be87e8f9bd9340213865d9a0d1c664aa46fcf053",
    "linux-tools-mac-darwin-x86_64.tar.gz": "7ee26dfbd0d2a4c2c83b55a9416a30cc84876eef01c6497ca49bb016a190c726",
  },
  // rebuilt on macOS 15 runners — binaries run on macOS 15+
  "1.0.1": {
    "linux-tools-mac-darwin-arm64.tar.gz": "3dcb43a12b8630919b8d5cc9045be102108b0edd9b0354e0a7409ee5b53141ac",
    "linux-tools-mac-darwin-x86_64.tar.gz": "d62f5e2f6949c6420fdda8b18d2e70b0e14eeb959128c0cea11acada2c105ad9",
  },
} as const

export async function getLinuxToolsPath(toolset?: ToolsetConfig["linuxToolsMac"], resourcesDir?: string): Promise<string> {
  if (typeof toolset === "object" && toolset != null) {
    return getCustomToolsetPath(toolset, resourcesDir ?? "")
  }
  const arch = process.arch === "arm64" ? "arm64" : "x86_64"
  const version = resolveToolsetVersion(toolset, LINUX_TOOLS_MAC_LATEST)
  const checksums = linuxToolsMacChecksums[version]
  const filename: keyof typeof checksums = `linux-tools-mac-darwin-${arch}.tar.gz`
  return downloadBuilderToolset({
    releaseName: `linux-tools-mac@${version}`,
    filenameWithExt: filename,
    checksums,
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })
}

export async function getLinuxToolsMacToolset(toolset?: ToolsetConfig["linuxToolsMac"], resourcesDir?: string) {
  const linuxToolsPath = await getLinuxToolsPath(toolset, resourcesDir)
  const bin = (pkg: string) => path.join(linuxToolsPath, "bin", pkg)
  return {
    ar: bin("ar"),
    lzip: bin("lzip"),
    gtar: bin("gtar"),
  }
}
