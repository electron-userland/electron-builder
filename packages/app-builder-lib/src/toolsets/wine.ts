import { exists, InvalidConfigurationError, resolveEnvToolsetPath, sanitizeDirPath } from "builder-util"
import * as path from "path"
import { ToolsetConfig } from "../configuration"
import { downloadBuilderToolset } from "../util/electronGet"

const wineToolsChecksums: Record<Exclude<ToolsetConfig["wine"], null | undefined>, Record<string, string>> = {
  "0.0.0": {
    "wine-4.0.1-mac.7z": "1baac808a67975b68b9226beea7b64ad0acc3e598a4b45c25bb5d2ae8cac655e",
  },
  "1.0.1": {
    "wine-11.0-darwin-x86_64.tar.xz": "0a4a43867ef225c70ed8d4198aaba24a55cb0e52e5d67b0ac99563e6351a3c61",
    "wine-11.0-linux-x86_64.tar.xz": "d8cf95442957b75c07166540142c96d8f7be6a68a572cc656194e7b42e8a0f13",
  },
}

export async function getWineToolset(wine: ToolsetConfig["wine"]): Promise<{ execPath: string; env: Record<string, string> }> {
  if (process.platform === "win32") {
    throw new InvalidConfigurationError(`Wine toolset is not supported on Windows, but got: ${wine}`)
  }

  const defaultEnv = { WINEDEBUG: "-all,err+all", WINEDLLOVERRIDES: "winemenubuilder.exe=d" }

  const envPath = await resolveEnvToolsetPath("ELECTRON_BUILDER_WINE_TOOLSET_DIR", "directory")
  if (envPath != null) {
    // Probe for the wine binary: modern bundles ship bin/wine; legacy bundles (e.g. wine-4.0.1-mac) ship bin/wine64.
    const wineExecSubPath = (await exists(path.join(envPath, "bin", "wine"))) ? "bin/wine" : "bin/wine64"
    const { execPath, winePrefix, wineLibPath } = await createWineEnvironment(envPath, wineExecSubPath)

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

  const useSystemWine = process.env.USE_SYSTEM_WINE === "true"
  const isLegacy = wine === "0.0.0" || wine == null
  const isLegacyOnLinux = isLegacy && process.platform === "linux"

  if (useSystemWine || isLegacyOnLinux) {
    return { execPath: "wine", env: defaultEnv }
  }

  const pkgConfig = () => {
    if (isLegacy) {
      return {
        releaseName: "wine-4.0.1-mac",
        filenameWithExt: "wine-4.0.1-mac.7z",
        checksums: wineToolsChecksums["0.0.0"],
        execPath: path.join("bin", "wine64"),
      }
    }
    const filenameWithExt = process.platform === "darwin" ? "wine-11.0-darwin-x86_64.tar.xz" : "wine-11.0-linux-x86_64.tar.xz"
    return {
      releaseName: `wine@${wine}`,
      filenameWithExt,
      checksums: wineToolsChecksums[wine],
      execPath: path.join("bin", "wine"),
    }
  }

  const pkg = pkgConfig()
  const toolsetPath = await downloadBuilderToolset({
    releaseName: pkg.releaseName,
    filenameWithExt: pkg.filenameWithExt,
    checksums: pkg.checksums,
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })

  const { execPath, winePrefix, wineLibPath } = await createWineEnvironment(toolsetPath, pkg.execPath)
  return {
    execPath,
    env: {
      ...defaultEnv,
      WINEPREFIX: winePrefix,
      DYLD_FALLBACK_LIBRARY_PATH: [wineLibPath, process.env.DYLD_FALLBACK_LIBRARY_PATH].filter(Boolean).join(path.delimiter),
      LD_LIBRARY_PATH: [wineLibPath, process.env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter),
    },
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
}
