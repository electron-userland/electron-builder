import { exists, InvalidConfigurationError, log, sanitizeDirPath } from "builder-util"
import { Nullish } from "builder-util-runtime"
import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { findHostWine, HOST_WINE_PATHS } from "../util/systemTools.js"
import { getCustomToolsetPath } from "./custom.js"

const githubOrgRepo = "electron-userland/electron-builder-binaries"

// What an unset / null / "latest" config resolves to. Not necessarily a bundle version: the published
// wine@1.0.1 bundles ship no PE builtins, so the default is the host wine (at a fixed install location).
const WINE_LATEST = "system"

const wineToolsChecksums: Record<string, Record<string, string>> = {
  "0.0.0": {
    "wine-4.0.1-mac.7z": "1baac808a67975b68b9226beea7b64ad0acc3e598a4b45c25bb5d2ae8cac655e",
  },
  "1.0.1": {
    "wine-11.0-darwin-x86_64.tar.xz": "0a4a43867ef225c70ed8d4198aaba24a55cb0e52e5d67b0ac99563e6351a3c61",
    "wine-11.0-linux-x86_64.tar.xz": "d8cf95442957b75c07166540142c96d8f7be6a68a572cc656194e7b42e8a0f13",
  },
}

export async function getWineToolset(wine: ToolsetConfig["wine"] | Nullish, resourcesDir: string): Promise<{ execPath: string; env: Record<string, string> }> {
  if (process.platform === "win32") {
    // oxlint-disable-next-line typescript/no-base-to-string -- pre-existing message; a custom toolset object prints as "[object Object]", changing it is out of scope for the lint migration
    throw new InvalidConfigurationError(`Wine toolset is not supported on Windows, but got: ${wine}`)
  }

  const defaultEnv = { WINEDEBUG: "-all,err+all", WINEDLLOVERRIDES: "winemenubuilder.exe=d" }

  // Resolve the "latest"/unset alias up front so every branch below sees a concrete toolset, and an
  // explicitly requested version is never silently swapped for whatever WINE_LATEST points at.
  const toolset = wine == null || wine === "latest" ? WINE_LATEST : wine

  let toolsetPath: string
  let execSubPath: string

  if (typeof toolset === "object") {
    // Custom toolset — honored on every platform (never overridden by the host-wine branch below).
    toolsetPath = await getCustomToolsetPath(toolset, resourcesDir)
    execSubPath = (await exists(path.join(toolsetPath, "bin", "wine"))) ? "bin/wine" : "bin/wine64"
  } else if (toolset === "system" || process.platform === "linux") {
    // Host wine, only from its fixed install locations — never looked up on PATH. Linux ships no portable bundle so it always
    // lands here; other platforms opt in with `toolsets.wine: "system"` — the replacement for the `USE_SYSTEM_WINE` env var
    // removed in v27.
    return { execPath: systemWinePath(), env: defaultEnv }
  } else if (toolset === "0.0.0") {
    // Explicit opt-in to the legacy wine-4.0.1-mac bundle (pre-v27).
    toolsetPath = await downloadBuilderToolset({
      releaseName: "wine-4.0.1-mac",
      filenameWithExt: "wine-4.0.1-mac.7z",
      checksums: wineToolsChecksums["0.0.0"],
      githubOrgRepo,
    })
    execSubPath = path.join("bin", "wine64")
  } else {
    // Explicitly requested bundle version, e.g. "1.0.1" → wine@1.0.1 (wine 11; arm64 macOS via Rosetta).
    const file = process.platform === "darwin" ? "wine-11.0-darwin-x86_64.tar.xz" : "wine-11.0-linux-x86_64.tar.xz"
    toolsetPath = await downloadBuilderToolset({
      releaseName: `wine@${toolset}`,
      filenameWithExt: file,
      checksums: wineToolsChecksums[toolset],
      githubOrgRepo,
    })
    execSubPath = (await exists(path.join(toolsetPath, "bin", "wine"))) ? "bin/wine" : "bin/wine64"
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

let loggedHostWine: string | null = null

function systemWinePath(): string {
  const wine = findHostWine()
  if (wine == null) {
    const paths = HOST_WINE_PATHS[process.platform] ?? []
    throw new InvalidConfigurationError(`Wine is used only from its install locations (${paths.join(", ")}), where it was not found. Install Wine at one of these locations.`)
  }
  if (loggedHostWine !== wine) {
    loggedHostWine = wine
    log.debug({ path: wine }, "using host Wine")
  }
  return wine
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
