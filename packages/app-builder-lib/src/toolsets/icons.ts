import { exec, exists, InvalidConfigurationError, resolveEnvToolsetPath } from "builder-util"
import * as path from "path"
import { downloadBuilderToolset } from "../util/electronGet"

// SHA256 checksums — placeholder until published to electron-builder-binaries.
// If ELECTRON_BUILDER_ICONS_TOOLSET_DIR is not set and the bundle has not been
// published yet, the download will fail with a checksum mismatch (safe failure).
const iconsToolsChecksums = {
  "icons-bundle.tar.gz": "d41d8cd98f00b204e9800998ecf8427e",
} as const

export async function getIconsToolsetPath(): Promise<string> {
  const envPath = await resolveEnvToolsetPath("ELECTRON_BUILDER_ICONS_TOOLSET_DIR", "directory")
  if (envPath != null) {
    return envPath
  }
  return downloadBuilderToolset({
    releaseName: "icons@1.0.0",
    filenameWithExt: "icons-bundle.tar.gz",
    checksums: iconsToolsChecksums,
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })
}

export async function runIconsTool(inputFile: string, format: "icns" | "ico" | "set", outDir: string): Promise<void> {
  const toolsetPath = await getIconsToolsetPath()
  // path.resolve (not path.join) to eliminate any residual .. components in toolsetPath
  const scriptPath = path.resolve(toolsetPath, "icon-tool.js")
  if (!(await exists(scriptPath))) {
    throw new InvalidConfigurationError(`Icons tool not found at expected path: ${scriptPath}`)
  }
  // exec uses execFile internally — args are passed as an array, not through a shell,
  // so no shell injection is possible regardless of inputFile/outDir content.
  await exec(process.execPath, [scriptPath, `--input=${inputFile}`, `--format=${format}`, `--out=${outDir}`])
}
