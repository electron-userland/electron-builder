import { exists, InvalidConfigurationError } from "builder-util"
import { Nullish } from "builder-util-runtime"
import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { ToolInfo } from "../util/bundledTool.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { getCustomToolsetPath } from "./custom.js"
import { resolveToolsetVersion } from "./version.js"
import _fsExtra from "fs-extra"
const { stat } = _fsExtra

// Newest NSIS bundle — selected when the config is unset / null / "latest".
const NSIS_LATEST = "2.0.2"

function getLegacyNsisBin(): Promise<string> {
  // Warning: Don't use v3.0.4.2 - https://github.com/electron-userland/electron-builder/issues/6334
  return downloadBuilderToolset({
    releaseName: "nsis-3.0.4.1",
    filenameWithExt: "nsis-3.0.4.1.7z",
    checksums: { "nsis-3.0.4.1.7z": "9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa" },
  })
}

function getLegacyNsisResourcesBin(): Promise<string> {
  return downloadBuilderToolset({
    releaseName: "nsis-resources-3.4.1",
    filenameWithExt: "nsis-resources-3.4.1.7z",
    checksums: { "nsis-resources-3.4.1.7z": "593a9a92ef958321293ac6a2ee61e64bf1bd543142a5bd6b3d310709cc924103" },
  })
}

export const nsisChecksums = {
  "0.0.0": {
    // legacy — uses getLegacyNsisBin() / getLegacyNsisResourcesBin()
  },
  "1.2.1": {
    // unified bundle
    "nsis-bundle-3.12.tar.gz": "56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4",
  },
  "2.0.2": {
    // unified bundle, NSIS 3.12 compiled from source: every makensis (Linux, macOS, Windows) and the Windows stubs are log-enabled
    "nsis-bundle-3.12.tar.gz": "83d80ee578cb19008b2a99e4fccfb5e7c023cc9bb791eb38f6048fccc875f62c",
  },
} as const

// Bundled versions whose makensis is not compiled with NSIS_CONFIG_LOG=yes: the legacy NSIS 3.0.4.1 and nsis@1.2.1 (stock NSIS 3.12).
// nsis@2.0.2 is the first bundle with log-enabled makensis builds for every host and log-enabled stubs.
const NSIS_VERSIONS_WITHOUT_LOGGING: ReadonlySet<string> = new Set<keyof typeof nsisChecksums>(["0.0.0", "1.2.1"])

/**
 * Whether `toolsets.nsis` selects a log-enabled NSIS, which `installerDebugLogging` needs. The default (unset / `"latest"`) and
 * `"2.0.2"` are; the older pinned bundles (`"0.0.0"`, `"1.2.1"`) are not. A custom bundle is assumed to be log-enabled
 * (makensis rejects `LogSet` if it is not).
 */
export function isNsisLoggingSupported(nsis: ToolsetConfig["nsis"] | Nullish): boolean {
  if (typeof nsis === "object" && nsis != null) {
    return true
  }
  return !NSIS_VERSIONS_WITHOUT_LOGGING.has(resolveToolsetVersion(nsis, NSIS_LATEST))
}

/**
 * `installerDebugLogging` emits `LogSet`, which only a `makensis` compiled with `NSIS_CONFIG_LOG=yes` accepts ("LogSet specified,
 * NSIS_CONFIG_LOG not defined" otherwise). The default bundle (nsis@2.0.2 and newer) is log-enabled; the older pinned bundles are not.
 */
export function assertInstallerDebugLoggingSupported(nsis: ToolsetConfig["nsis"] | Nullish, targetName: string): void {
  // a custom bundle and the default (unset / "latest") are always supported, so only a pinned bundled version is left here
  if (isNsisLoggingSupported(nsis) || typeof nsis !== "string") {
    return
  }
  throw new InvalidConfigurationError(
    `\`installerDebugLogging\` (${targetName} target) needs a log-enabled NSIS (makensis and stubs compiled with NSIS_CONFIG_LOG=yes), ` +
      `but \`toolsets.nsis\` is "${nsis}", which selects a bundled NSIS that is not log-enabled.\n` +
      `  Remove the \`toolsets.nsis\` pin (or set it to "latest" or "${NSIS_LATEST}") to use the log-enabled default bundle, supply a log-enabled custom ` +
      "`toolsets.nsis: { url, checksum, version }`, or remove `installerDebugLogging`.\n" +
      "  https://www.electron.build/docs/migration/v27-config-changes#customnsisbinary-and-customnsisresources-replaced-by-toolsetsnsis"
  )
}

async function getNsisBundlePath(nsis: ToolsetConfig["nsis"] | Nullish, resourcesDir: string): Promise<string> {
  if (typeof nsis === "object" && nsis != null) {
    return getCustomToolsetPath(nsis, resourcesDir)
  }
  const resolved = resolveToolsetVersion(nsis, NSIS_LATEST)
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

export async function getMakeNsisPath(nsis: ToolsetConfig["nsis"] | Nullish, resourcesDir: string): Promise<ToolInfo> {
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
  if (nsis === "0.0.0") {
    return legacyBundle(bundlePath)
  }
  if (typeof nsis === "object") {
    const entrypoint = entrypointBundle(bundlePath)
    if (await exists(entrypoint.path)) {
      return entrypoint
    }
    return legacyBundle(bundlePath)
  }
  return entrypointBundle(bundlePath)
}

export async function getNsisPluginsPath(nsis: ToolsetConfig["nsis"] | Nullish, resourcesDir: string): Promise<string> {
  const resolvePluginsDir = async (bundlePath: string) => {
    const potentialPaths = [path.resolve(bundlePath, "plugins"), path.resolve(bundlePath, "windows", "Plugins")]
    for (const p of potentialPaths) {
      if ((await exists(p)) && (await stat(p)).isDirectory()) {
        return p
      }
    }
    throw new Error(`Plugins directory not found in NSIS bundle at: ${bundlePath}. Expected one of: ${potentialPaths.join(", ")}`)
  }
  if (nsis === "0.0.0") {
    return path.resolve(await getLegacyNsisResourcesBin(), "plugins")
  }
  return resolvePluginsDir(await getNsisBundlePath(nsis, resourcesDir))
}

export async function getNsisElevatePath(nsis: ToolsetConfig["nsis"] | Nullish, resourcesDir: string): Promise<string> {
  const resolveElevate = async (dir: string) => {
    const p = path.resolve(dir, "elevate.exe")
    if ((await exists(p)) && (await stat(p)).isFile()) {
      return p
    }
    throw new Error(`elevate.exe not found in NSIS bundle at: ${dir}. Expected path: ${p}`)
  }
  return resolveElevate(await getNsisBundlePath(nsis, resourcesDir))
}
