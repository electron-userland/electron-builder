import { exec, exists, InvalidConfigurationError, resolveEnvToolsetPath } from "builder-util"
import * as path from "path"
import { downloadBuilderToolset } from "../util/electronGet"

const iconsToolsChecksums = {
  "icons-bundle.tar.gz": "a96b7322c2562dfa53e675c343b17326b79709b793fe8023314584a7891d2b44",
} as const

export async function getIconsToolsetPath(): Promise<string> {
  const envPath = await resolveEnvToolsetPath("ELECTRON_BUILDER_ICONS_TOOLSET_DIR", "directory")
  if (envPath != null) {
    return envPath
  }
  return downloadBuilderToolset({
    releaseName: "icons@1.0.1",
    filenameWithExt: "icons-bundle.tar.gz",
    checksums: iconsToolsChecksums,
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })
}

type IconConversionOptions = {
  inputFile: string
  outputFormat: "icns" | "ico" | "set"
  outDir: string
}

export async function runIconsTool({ inputFile, outputFormat, outDir }: IconConversionOptions): Promise<void> {
  const toolsetPath = await getIconsToolsetPath()
  const scriptPath = path.resolve(toolsetPath, "icon-tool.js")
  if (!(await exists(scriptPath))) {
    throw new InvalidConfigurationError(`Icons tool not found at expected path: ${scriptPath}`)
  }
  // codeql[js/shell-command-constructed-from-input] - exec uses execFile (no shell); inputFile is verified to exist via stat() before this call; outputFormat is a string-literal union ("icns"|"ico"|"set"); outDir is constructed from projectDir + config output
  await exec(process.execPath, [scriptPath, `--input=${inputFile}`, `--format=${outputFormat}`, `--out=${outDir}`])
}
