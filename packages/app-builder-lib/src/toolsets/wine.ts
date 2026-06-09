import { exists, InvalidConfigurationError, sanitizeDirPath } from "builder-util"
import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { getCustomToolsetPath } from "./custom.js"

const wineToolsChecksums: Record<string, Record<string, string>> = {
  "0.0.0": {
    "wine-4.0.1-mac.7z": "1baac808a67975b68b9226beea7b64ad0acc3e598a4b45c25bb5d2ae8cac655e",
  },
  "1.0.1": {
    "wine-11.0-darwin-x86_64.tar.xz": "0a4a43867ef225c70ed8d4198aaba24a55cb0e52e5d67b0ac99563e6351a3c61",
    "wine-11.0-linux-x86_64.tar.xz": "d8cf95442957b75c07166540142c96d8f7be6a68a572cc656194e7b42e8a0f13",
  },
}

export async function getWineToolset(wine: ToolsetConfig["wine"], resourcesDir: string): Promise<{ execPath: string; env: Record<string, string> }> {
  if (process.platform === "win32") {
    throw new InvalidConfigurationError(`Wine toolset is not supported on Windows, but got: ${wine}`)
  }

  const defaultEnv = { WINEDEBUG: "-all,err+all", WINEDLLOVERRIDES: "winemenubuilder.exe=d" }

  const useSystemWine = process.env.USE_SYSTEM_WINE === "true"
  // null → modern default "1.0.1"
  const isLegacy = (wine ?? "1.0.1") === "0.0.0"
  const isLegacyOnLinux = isLegacy && process.platform === "linux"

  if (useSystemWine || isLegacyOnLinux) {
    return { execPath: "wine", env: defaultEnv }
  }

  let toolsetPath: string
  let execSubPath: string

  if (typeof wine === "object" && wine != null) {
    toolsetPath = await getCustomToolsetPath(wine, resourcesDir)
    // Custom bundles: probe for the wine binary location
    execSubPath = (await exists(path.join(toolsetPath, "bin", "wine"))) ? "bin/wine" : "bin/wine64"
  } else {
    const resolved = wine ?? "1.0.1"
    if (isLegacy) {
      toolsetPath = await downloadBuilderToolset({
        releaseName: "wine-4.0.1-mac",
        filenameWithExt: "wine-4.0.1-mac.7z",
        checksums: wineToolsChecksums["0.0.0"],
        githubOrgRepo: "electron-userland/electron-builder-binaries",
      })
      execSubPath = path.join("bin", "wine64")
    } else {
      const filenameWithExt = process.platform === "darwin" ? "wine-11.0-darwin-x86_64.tar.xz" : "wine-11.0-linux-x86_64.tar.xz"
      toolsetPath = await downloadBuilderToolset({
        releaseName: `wine@${resolved}`,
        filenameWithExt,
        checksums: wineToolsChecksums[resolved],
        githubOrgRepo: "electron-userland/electron-builder-binaries",
      })
      execSubPath = path.join("bin", "wine")
    }
  }

  const { execPath, winePrefix, wineLibPath } = await createWineEnvironment(toolsetPath, execSubPath)
  return {
    execPath,
    env: {
      ...defaultEnv,
      WINEPREFIX: winePrefix,
      DYLD_FALLBACK_LIBRARY_PATH: [wineLibPath, process.env.DYLD_FALLBACK_LIBRARY_PATH].filter(Boolean).join(path.delimiter),
      LD_LIBRARY_PATH: [wineLibPath, process.env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter),
    },
  }
}

async function createWineEnvironment(toolsetPath: string, execSubPath: string) {
  const sanitizedWinePath = sanitizeDirPath(toolsetPath)

  const execPath = path.resolve(sanitizedWinePath, execSubPath)
  const winePrefix = path.resolve(sanitizedWinePath, "wine-home")

  for (const p of [execPath, winePrefix]) {
    if (!(await exists(p))) {
      throw new InvalidConfigurationError(`Wine toolset at "${toolsetPath}" is missing expected path: ${p}`)
    }
  }

  // Modern bundles ship a `lib` dir; the legacy wine-4.0.1-mac bundle ships `lib64` instead.
  let wineLibPath: string | null = null
  for (const libDir of ["lib", "lib64"]) {
    const candidate = path.resolve(sanitizedWinePath, libDir)
    if (await exists(candidate)) {
      wineLibPath = candidate
      break
    }
  }
  if (wineLibPath == null) {
    throw new InvalidConfigurationError(`Wine toolset at "${toolsetPath}" is missing expected library directory (lib or lib64)`)
  }

  return { execPath, winePrefix, wineLibPath }
}
