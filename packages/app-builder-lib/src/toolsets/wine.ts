import { exists, InvalidConfigurationError, resolveEnvToolsetPath, sanitizeDirPath } from "builder-util"
import * as path from "path"
import { ToolsetConfig } from "../configuration"
import { downloadBuilderToolset } from "../util/electronGet"

const wineToolsChecksums: Record<string, Record<string, string>> = {
  "0.0.0": {
    "wine-4.0.1-mac.7z": "1baac808a67975b68b9226beea7b64ad0acc3e598a4b45c25bb5d2ae8cac655e",
  },
  "1.0.0": {
    "wine-bundle.tar.gz": "STUB",
  },
}

export async function getWineToolset(wine: ToolsetConfig["wine"]) {
  if (process.platform === "win32") {
    throw new InvalidConfigurationError(`Wine toolset is not supported on Windows, but got: ${wine}`)
  }

  const defaultEnv = { WINEDEBUG: "-all,err+all", WINEDLLOVERRIDES: "winemenubuilder.exe=d" }

  const envPath = await resolveEnvToolsetPath("ELECTRON_BUILDER_WINE_TOOLSET_DIR", "directory")
  if (envPath != null) {
    return { path: envPath, env: defaultEnv }
  }

  const useSystemWine = process.env.USE_SYSTEM_WINE === "true"
  const isLegacy = wine === "0.0.0" || wine == null
  const isLegacyOnLinux = isLegacy && process.platform === "linux"

  if (useSystemWine || isLegacyOnLinux) {
    return { path: "wine", env: defaultEnv }
  }

  const pkg = isLegacy
    ? {
        releaseName: "wine-4.0.1-mac",
        filenameWithExt: "wine-4.0.1-mac.7z",
        checksums: wineToolsChecksums["0.0.0"],
        execPath: path.join("wine-4.0.1-mac", "bin", "wine64"),
      }
    : {
        releaseName: `wine@${wine}`,
        filenameWithExt: "wine-bundle.tar.gz",
        checksums: wineToolsChecksums[wine],
        execPath: path.join("wine-bundle", "bin", "wine"),
      }

  const toolsetPath = await downloadBuilderToolset({
    releaseName: pkg.releaseName,
    filenameWithExt: pkg.filenameWithExt,
    checksums: pkg.checksums,
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })

  const winePath = path.resolve(toolsetPath, pkg.execPath)
  const sanitizedWinePath = sanitizeDirPath(winePath)
  if (!(await exists(sanitizedWinePath))) {
    throw new InvalidConfigurationError(`Wine not found at expected path: ${sanitizedWinePath}`)
  }
  return {
    path: sanitizedWinePath,
    env: {
      ...defaultEnv,
      WINEPREFIX: path.resolve(toolsetPath, "wine-home"),
      DYLD_FALLBACK_LIBRARY_PATH: [path.resolve(toolsetPath, "lib"), process.env.DYLD_FALLBACK_LIBRARY_PATH].filter(Boolean).join(path.delimiter),
    },
  }
}
