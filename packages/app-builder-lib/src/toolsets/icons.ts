import { exec, exists, InvalidConfigurationError, resolveEnvToolsetPath, sanitizeDirPath } from "builder-util"
import * as path from "path"
import { downloadBuilderToolset } from "../util/electronGet.js"

const iconsToolsChecksums = {
  "icons-bundle.tar.gz": "2241c9501aa5ddd19317956449f50a1bc311df2c34058aae9bf8bfe62081eaec",
} as const

export async function getIconsToolsetPath(): Promise<string> {
  const envPath = await resolveEnvToolsetPath("ELECTRON_BUILDER_ICONS_TOOLSET_DIR", "directory")
  if (envPath != null) {
    return envPath
  }
  return downloadBuilderToolset({
    releaseName: "icons@1.1.0",
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

const VALID_OUTPUT_FORMATS = ["icns", "ico", "set"] as const

export async function runIconsTool({ inputFile, outputFormat, outDir }: IconConversionOptions): Promise<void> {
  if (!(VALID_OUTPUT_FORMATS as readonly string[]).includes(outputFormat)) {
    throw new InvalidConfigurationError(`Invalid icon output format: ${outputFormat}`)
  }
  const safeInput = sanitizeDirPath(inputFile)
  const safeOutDir = sanitizeDirPath(outDir)

  const toolsetPath = await getIconsToolsetPath()
  const scriptPath = path.resolve(toolsetPath, "icon-tool.js")
  if (!(await exists(scriptPath))) {
    throw new InvalidConfigurationError(`Icons tool not found at expected path: ${scriptPath}`)
  }
  await exec(process.execPath, [scriptPath, `--input=${safeInput}`, `--format=${outputFormat}`, `--out=${safeOutDir}`], { shell: false })
}
