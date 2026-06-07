import * as path from "path"
import { ToolsetConfig } from "."
import { downloadBuilderToolset } from "../util/electronGet"
import { getCustomToolsetPath } from "./custom"

// no legacy toolset as macos arm64 BSD gtar/ar/lzip are not compatible with linux targets, so we always use newer toolset on macos for linux archives
const linuxToolsMacChecksums = {
  "linux-tools-mac-darwin-arm64.tar.gz": "204e76f08364352edb28a6a4be87e8f9bd9340213865d9a0d1c664aa46fcf053",
  "linux-tools-mac-darwin-x86_64.tar.gz": "7ee26dfbd0d2a4c2c83b55a9416a30cc84876eef01c6497ca49bb016a190c726",
} as const

export async function getLinuxToolsPath(toolset: ToolsetConfig["linuxToolsMac"], resourceDir: string): Promise<string> {
  if (typeof toolset === "object" && toolset != null) {
    return getCustomToolsetPath(toolset, resourceDir)
  }

  const arch = process.arch === "arm64" ? "arm64" : "x86_64"
  const filename: keyof typeof linuxToolsMacChecksums = `linux-tools-mac-darwin-${arch}.tar.gz`
  return await downloadBuilderToolset({
    releaseName: `linux-tools-mac@${toolset ?? "1.0.0"}`,
    filenameWithExt: filename,
    checksums: linuxToolsMacChecksums,
  })
}

export async function getLinuxToolsMacToolset(toolset: ToolsetConfig["linuxToolsMac"], resourcesDir: string): Promise<{ ar: string; lzip: string; gtar: string }> {
  const linuxToolsPath = await getLinuxToolsPath(toolset, resourcesDir)
  const bin = (pkg: string) => path.join(linuxToolsPath, "bin", pkg)
  return {
    ar: bin("ar"),
    lzip: bin("lzip"),
    gtar: bin("gtar"),
  }
}
