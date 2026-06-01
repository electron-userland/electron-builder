import { resolveEnvToolsetPath, exists } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { stat } from "fs-extra"
import * as path from "path"
import { getBinFromUrl, getBinFromCustomLoc } from "../binDownload"
import { ToolsetConfig } from "../configuration"
import { ToolInfo } from "../util/bundledTool"
import { downloadBuilderToolset } from "../util/electronGet"

// ─── NSIS toolset ────────────────────────────────────────────────────────────
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
    // unified bundle
    "nsis-bundle-3.12.tar.gz": "56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4",
  },
} as const
type CustomNsisBinaryConfig = { url: string | null; checksum?: string | null; version?: string | null }

async function getNsisBundlePath(nsis: ToolsetConfig["nsis"], customBinary?: CustomNsisBinaryConfig | null): Promise<string> {
  if (customBinary?.url && customBinary?.checksum) {
    const binaryVersion = customBinary.version ?? customBinary.checksum.substring(0, 8)
    return getBinFromCustomLoc("nsis", binaryVersion, customBinary.url, customBinary.checksum)
  }
  if (nsis === "0.0.0" || nsis == null) {
    return getLegacyNsisBin()
  }
  const file = `nsis-bundle-3.12.tar.gz`
  return downloadBuilderToolset({
    releaseName: `nsis@${nsis}`,
    filenameWithExt: file,
    checksums: { [file]: nsisChecksums[nsis][file] },
  })
}

export async function getMakeNsisPath(nsis: ToolsetConfig["nsis"] | Nullish, customBinary?: CustomNsisBinaryConfig | null): Promise<ToolInfo> {
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

  const overridePath = await resolveEnvToolsetPath("ELECTRON_BUILDER_NSIS_DIR", "directory")
  if (overridePath != null) {
    // we have to search both to maintain backward compatibility
    let potentialBundle: ToolInfo = legacyBundle(overridePath)
    if (await exists(potentialBundle.path)) {
      return potentialBundle
    }
    potentialBundle = entrypointBundle(overridePath)
    if (await exists(potentialBundle.path)) {
      return potentialBundle
    }
    throw new Error(`${path.basename(potentialBundle.path)} executable not found in ELECTRON_BUILDER_NSIS_DIR: ${overridePath}`)
  }

  const bundlePath = await getNsisBundlePath(nsis, customBinary)
  if (nsis === "0.0.0" || nsis == null) {
    return legacyBundle(bundlePath)
  }
  return entrypointBundle(bundlePath)
}
type CustomNsisResourcesConfig = { url: string; checksum: string; version: string }

export async function getNsisPluginsPath(nsis: ToolsetConfig["nsis"] | Nullish, customNsisResources?: CustomNsisResourcesConfig | null): Promise<string> {
  const resolveCustomBundle = async (bundlePath: string, type: "ELECTRON_BUILDER_NSIS_RESOURCES_DIR" | "CUSTOM_NSIS_RESOURCES") => {
    // we have to search both to maintain backward compatibility
    const potentialPaths = [path.resolve(bundlePath, "plugins"), path.resolve(bundlePath, "windows", "Plugins")]
    for (const p of potentialPaths) {
      if ((await exists(p)) && (await stat(p)).isDirectory()) {
        return p
      }
    }
    throw new Error(`Plugins directory not found in ${type}: ${bundlePath}. Expected to find in one of: ${potentialPaths.join(", ")}`)
  }
  const overridePath = await resolveEnvToolsetPath("ELECTRON_BUILDER_NSIS_RESOURCES_DIR", "directory")
  if (overridePath != null) {
    return resolveCustomBundle(overridePath, "ELECTRON_BUILDER_NSIS_RESOURCES_DIR")
  }
  if (customNsisResources) {
    const bundle = await getBinFromCustomLoc("nsis-resources", customNsisResources.version, customNsisResources.url, customNsisResources.checksum)
    return resolveCustomBundle(bundle, "CUSTOM_NSIS_RESOURCES")
  }
  if (nsis === "0.0.0" || nsis == null) {
    return path.resolve(await getLegacyNsisResourcesBin(), "plugins")
  }
  return path.resolve(await getNsisBundlePath(nsis), "windows", "Plugins")
}

export async function getNsisElevatePath(nsis: ToolsetConfig["nsis"] | Nullish, customBinary?: CustomNsisBinaryConfig | null): Promise<string> {
  const resolveElevate = async (dir: string, label: string) => {
    const p = path.resolve(dir, "elevate.exe")
    if ((await exists(p)) && (await stat(p)).isFile()) {
      return p
    }
    throw new Error(`elevate.exe not found in ${label} directory: ${dir}. Expected path: ${p}`)
  }
  const overridePath = await resolveEnvToolsetPath("ELECTRON_BUILDER_NSIS_DIR", "directory")
  if (overridePath != null) {
    return resolveElevate(overridePath, "ELECTRON_BUILDER_NSIS_DIR")
  }
  return resolveElevate(await getNsisBundlePath(nsis, customBinary), "NSIS bundle")
}
