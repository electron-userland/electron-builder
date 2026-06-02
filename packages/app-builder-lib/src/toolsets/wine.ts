import { exists, InvalidConfigurationError, resolveEnvToolsetPath, sanitizeDirPath } from "builder-util"
import * as path from "path"
import { ToolsetConfig } from "../configuration"
import { downloadBuilderToolset } from "../util/electronGet"

const wineToolsChecksums: Record<string, Record<string, string>> = {
  "0.0.0": {
    "wine-4.0.1-mac.7z": "1baac808a67975b68b9226beea7b64ad0acc3e598a4b45c25bb5d2ae8cac655e",
  },
  "1.0.0": {
    "wine-11.0-linux-x86_64.tar.xz": "STUB",
    "wine-11.0-darwin-x86_64.tar.xz": "STUB",
  },
}

export async function getWineToolset(wine: ToolsetConfig["wine"]): Promise<{ execPath: string; env: Record<string, string> }> {
  if (process.platform === "win32") {
    throw new InvalidConfigurationError(`Wine toolset is not supported on Windows, but got: ${wine}`)
  }

  const defaultEnv = { WINEDEBUG: "-all,err+all", WINEDLLOVERRIDES: "winemenubuilder.exe=d" }

  const envPath = await resolveEnvToolsetPath("ELECTRON_BUILDER_WINE_TOOLSET_DIR", "directory")
  if (envPath != null) {
    const { execPath, winePrefix, dyldLibPaths } = await createWineEnvironment(envPath)

    return {
      execPath,
      env: {
        ...defaultEnv,
        WINEPREFIX: winePrefix,
        DYLD_FALLBACK_LIBRARY_PATH: [dyldLibPaths, process.env.DYLD_FALLBACK_LIBRARY_PATH].filter(Boolean).join(path.delimiter),
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
        execPath: "wine64",
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

  const { execPath, winePrefix, dyldLibPaths } = await createWineEnvironment(toolsetPath, pkg.execPath)
  return {
    execPath,
    env: {
      ...defaultEnv,
      WINEPREFIX: winePrefix,
      DYLD_FALLBACK_LIBRARY_PATH: dyldLibPaths,
    },
  }

  async function createWineEnvironment(toolsetPath: string, execSubPath = path.join("bin", "wine")) {
    const sanitizedWinePath = sanitizeDirPath(toolsetPath)

    const execPath = path.resolve(sanitizedWinePath, execSubPath)
    const winePrefix = path.resolve(sanitizedWinePath, "wine-home")
    const dyldLibPaths = [path.resolve(sanitizedWinePath, "lib"), process.env.DYLD_FALLBACK_LIBRARY_PATH].filter(Boolean).join(path.delimiter)

    for (const p of [execPath, winePrefix, ...dyldLibPaths]) {
      if (!(await exists(p))) {
        throw new InvalidConfigurationError(`Path specified by ELECTRON_BUILDER_WINE_TOOLSET_DIR does not contain expected structure, missing: ${p}`)
      }
    }
    return { execPath, winePrefix, dyldLibPaths }
  }
}
