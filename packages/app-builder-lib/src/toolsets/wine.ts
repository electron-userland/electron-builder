import { exists, InvalidConfigurationError, resolveEnvToolsetPath, sanitizeDirPath } from "builder-util"
import * as path from "path"
import { ToolsetConfig } from "../configuration"
import { downloadBuilderToolset } from "../util/electronGet"

const wineToolsChecksums: Record<string, Record<string, string>> = {
  "0.0.0": {
    "wine-4.0.1-mac.7z": "1baac808a67975b68b9226beea7b64ad0acc3e598a4b45c25bb5d2ae8cac655e",
  },
  "1.0.0": {
    "wine-11.0-linux-x86_64.tar.xz": "33f43eb7ade0a055a709d2d3bbfdb12b810eba25273580fbb1cb41a744506dec",
    "wine-11.0-darwin-x86_64.tar.xz": "da7c0fe102f8a59710b3527f6431f6a3d7a67c7265710a6978574a28b7473176",
  },
}

export async function getWineToolset(wine: ToolsetConfig["wine"]): Promise<{ execPath: string; env: Record<string, string> }> {
  if (process.platform === "win32") {
    throw new InvalidConfigurationError(`Wine toolset is not supported on Windows, but got: ${wine}`)
  }

  const defaultEnv = { WINEDEBUG: "-all,err+all", WINEDLLOVERRIDES: "winemenubuilder.exe=d" }

  const envPath = await resolveEnvToolsetPath("ELECTRON_BUILDER_WINE_TOOLSET_DIR", "directory")
  if (envPath != null) {
    const { execPath, winePrefix, dyldLibPaths } = await createWineEnvironment(envPath, "bin/wine")

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

  const { execPath, winePrefix, dyldLibPaths } = await createWineEnvironment(toolsetPath, pkg.execPath)
  return {
    execPath,
    env: {
      ...defaultEnv,
      WINEPREFIX: winePrefix,
      DYLD_FALLBACK_LIBRARY_PATH: dyldLibPaths,
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
    let dyldLibPath: string | null = null
    for (const libDir of ["lib", "lib64"]) {
      const candidate = path.resolve(sanitizedWinePath, libDir)
      if (await exists(candidate)) {
        dyldLibPath = candidate
        break
      }
    }
    if (dyldLibPath == null) {
      throw new InvalidConfigurationError(`Wine toolset at "${toolsetPath}" is missing expected library directory (lib or lib64)`)
    }

    return { execPath, winePrefix, dyldLibPaths: [dyldLibPath, process.env.DYLD_FALLBACK_LIBRARY_PATH].filter(Boolean).join(path.delimiter) }
  }
}
