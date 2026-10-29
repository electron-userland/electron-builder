import { InvalidConfigurationError } from "builder-util"
import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { getCustomToolsetPath } from "./custom.js"
import { resolveToolsetVersion } from "./version.js"

// Newest linux-tools-mac bundle — selected when the config is unset / null / "latest".
const LINUX_TOOLS_MAC_LATEST = "1.1.1"

// no legacy toolset as macos arm64 BSD gtar/ar/lzip are not compatible with linux targets, so we always use newer toolset on macos for linux archives
export const linuxToolsMacChecksums = {
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
  // trimmed to gtar, lzip and binutils 2.47 `ar` (`gar` symlinks to it) plus their dylibs and license files — still macOS 15+
  // (replaces 1.1.0, which shipped without the required license files and must not be used)
  "1.1.1": {
    "linux-tools-mac-darwin-arm64.tar.gz": "29bcd17a14c3285fa62fad10f2447ad21bc32cfd6a6cb2e62e341d5bb4e9ee18",
    "linux-tools-mac-darwin-x86_64.tar.gz": "61aea692e8b1c2207aa287934dcb22425e8a3b0ac75b6010708e3d48c6f11165",
  },
} as const

export async function getLinuxToolsPath(toolset?: ToolsetConfig["linuxToolsMac"], resourcesDir?: string): Promise<string> {
  if (typeof toolset === "object" && toolset != null) {
    return getCustomToolsetPath(toolset, resourcesDir ?? "")
  }
  const arch = process.arch === "arm64" ? "arm64" : "x86_64"
  const version = resolveToolsetVersion(toolset, LINUX_TOOLS_MAC_LATEST)
  // The `toolsets.linuxToolsMac` type and scheme.json only admit known versions, but a programmatic config
  // bypasses both. Never forward an unknown version (including the withdrawn 1.1.0): without a checksum
  // entry the downloader would run with integrity verification disabled.
  if (!Object.prototype.hasOwnProperty.call(linuxToolsMacChecksums, version)) {
    throw new InvalidConfigurationError(
      `Unknown toolsets.linuxToolsMac version "${version}". Known versions: ${Object.keys(linuxToolsMacChecksums).join(", ")} (or "latest"). ` +
        `To use a custom bundle, set toolsets.linuxToolsMac to a ToolsetCustom object (url + checksum) instead.`
    )
  }
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
