import { exists, InvalidConfigurationError, resolveEnvToolsetPath, sanitizeDirPath } from "builder-util"
import * as path from "path"
import { ToolsetConfig } from "../configuration"
import { downloadBuilderToolset } from "../util/electronGet"

const wineToolsChecksums: Record<string, Record<string, string>> = {
  "1.0.0": {
    "wine-bundle.tar.gz": "STUB",
  },
}

export async function getWineToolset(wine: ToolsetConfig["wine"]): Promise<string> {
  if (process.platform === "win32") {
    throw new InvalidConfigurationError(`Wine toolset is not supported on Windows, but got: ${wine}`)
  }

  // "0.0.0" / null = system wine (legacy behavior, no download)
  if (wine === "0.0.0" || wine == null) {
    return "wine"
  }

  if (process.env.ELECTRON_BUILDER_USE_SYSTEM_WINE === "true") {
    return "wine"
  }

  const envPath = await resolveEnvToolsetPath("ELECTRON_BUILDER_WINE_TOOLSET_DIR", "directory")
  if (envPath != null) {
    return envPath
  }

  const file = "wine-bundle.tar.gz"
  const toolsetPath = await downloadBuilderToolset({
    releaseName: `wine@${wine}`,
    filenameWithExt: file,
    checksums: wineToolsChecksums[wine],
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })

  const winePath = path.join(toolsetPath, process.platform, "wine")
  if (!path.isAbsolute(winePath)) {
    throw new InvalidConfigurationError(`Wine toolset path is not absolute: ${winePath}`)
  }
  const sanitizedWinePath = sanitizeDirPath(winePath)
  if (!(await exists(sanitizedWinePath))) {
    throw new InvalidConfigurationError(`Wine not found at expected path: ${sanitizedWinePath}`)
  }
  return sanitizedWinePath
}
