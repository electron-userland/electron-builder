import { exists } from "builder-util"
import _fsExtra from "fs-extra"
const { stat } = _fsExtra
import * as path from "path"
import { getBinFromUrl } from "../binDownload.js"
import { ToolsetConfig } from "../configuration.js"
import { ToolInfo } from "../util/bundledTool.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { getCustomToolsetPath } from "./custom.js"

function getLegacyNsisBin(): Promise<string> {
  // Warning: Don't use v3.0.4.2 - https://github.com/electron-userland/electron-builder/issues/6334
  return getBinFromUrl("nsis-3.0.4.1", "nsis-3.0.4.1.7z", "9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa")
}

function getLegacyNsisResourcesBin(): Promise<string> {
  return getBinFromUrl("nsis-resources-3.4.1", "nsis-resources-3.4.1.7z", "593a9a92ef958321293ac6a2ee61e64bf1bd543142a5bd6b3d310709cc924103")
}

export const nsisChecksums = {
  "0.0.0": {
    // legacy — uses getLegacyNsisBin() / getLegacyNsisResourcesBin()
  },
  "1.2.1": {
    "nsis-bundle-3.12.tar.gz": "56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4",
  },
} as const

async function getNsisBundlePath(nsis: ToolsetConfig["nsis"], resourcesDir: string): Promise<string> {
  if (typeof nsis === "object" && nsis != null) {
    return getCustomToolsetPath(nsis, resourcesDir)
  }
  const resolved = nsis ?? "1.2.1"
  if (resolved === "0.0.0") {
    return getLegacyNsisBin()
  }
  const file = "nsis-bundle-3.12.tar.gz"
  return downloadBuilderToolset({
    releaseName: `nsis@${resolved}`,
    filenameWithExt: file,
    checksums: { [file]: nsisChecksums[resolved][file] },
  })
}

export async function getMakeNsisPath(nsis: ToolsetConfig["nsis"], resourcesDir: string): Promise<ToolInfo> {
  const legacyBundle = (bundlePath: string) => {
    // legacy bundle: platform-specific subdirectories, NSISDIR must be set explicitly
    const env = { NSISDIR: bundlePath }
    if (process.platform === "darwin") {
      return { path: path.resolve(bundlePath, "mac", "makensis"), env }
    } else if (process.platform === "win32") {
      return { path: path.resolve(bundlePath, "Bin", "makensis.exe"), env }
    }
    return { path: path.resolve(bundlePath, "linux", "makensis"), env }
  }
  const entrypointBundle = (bundlePath: string) => {
    // the entrypoint script auto-sets NSISDIR
    return { path: path.resolve(bundlePath, process.platform === "win32" ? "makensis.cmd" : "makensis") }
  }

  const bundlePath = await getNsisBundlePath(nsis, resourcesDir)
  if ((nsis ?? "1.2.1") === "0.0.0") {
    return legacyBundle(bundlePath)
  }
  if (typeof nsis === "object") {
    // Custom bundle: try entrypoint first, fall back to legacy layout for backward compat
    const entrypoint = entrypointBundle(bundlePath)
    if (await exists(entrypoint.path)) {
      return entrypoint
    }
    return legacyBundle(bundlePath)
  }
  return entrypointBundle(bundlePath)
}

export async function getNsisPluginsPath(nsis: ToolsetConfig["nsis"], resourcesDir: string): Promise<string> {
  const resolvePluginsDir = async (bundlePath: string) => {
    const potentialPaths = [path.resolve(bundlePath, "plugins"), path.resolve(bundlePath, "windows", "Plugins")]
    for (const p of potentialPaths) {
      if ((await exists(p)) && (await stat(p)).isDirectory()) {
        return p
      }
    }
    throw new Error(`Plugins directory not found in NSIS bundle at: ${bundlePath}. Expected one of: ${potentialPaths.join(", ")}`)
  }
  if ((nsis ?? "1.2.1") === "0.0.0") {
    return path.resolve(await getLegacyNsisResourcesBin(), "plugins")
  }
  return resolvePluginsDir(await getNsisBundlePath(nsis, resourcesDir))
}

export async function getNsisElevatePath(nsis: ToolsetConfig["nsis"], resourcesDir: string): Promise<string> {
  const resolveElevate = async (dir: string) => {
    const p = path.resolve(dir, "elevate.exe")
    if ((await exists(p)) && (await stat(p)).isFile()) {
      return p
    }
    throw new Error(`elevate.exe not found in NSIS bundle directory: ${dir}`)
  }
  return resolveElevate(await getNsisBundlePath(nsis, resourcesDir))
}
