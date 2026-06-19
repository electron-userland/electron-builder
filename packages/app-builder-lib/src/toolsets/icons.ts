import { exec, exists, InvalidConfigurationError, sanitizeDirPath } from "builder-util"
import * as path from "path"
import { ToolsetConfig } from "../configuration.js"
import { downloadBuilderToolset } from "../util/electronGet.js"
import { withIconsLock } from "../util/toolsetLock.js"
import { getCustomToolsetPath } from "./custom.js"

const iconsToolsChecksums = {
  "1.1.0": {
    "icons-bundle.tar.gz": "2241c9501aa5ddd19317956449f50a1bc311df2c34058aae9bf8bfe62081eaec",
  },
  "1.2.0": {
    "icons-bundle.tar.gz": "788add2400487fe00d5ceac4a8347bd71fc43c8c988fde879f929992ea0c03ea",
  },
  "1.2.1": {
    "icons-bundle.tar.gz": "193241afc7c81ab165fa0af15ef0af88f796eb69e8e5bb4249a49310d8be242a",
  },
} as const

export async function getIconsToolsetPath(icons: ToolsetConfig["icons"], resourcesDir: string): Promise<string> {
  if (typeof icons === "object" && icons != null) {
    return getCustomToolsetPath(icons, resourcesDir)
  }
  const version = icons ?? "1.2.1"
  return downloadBuilderToolset({
    releaseName: `icons@${version}`,
    filenameWithExt: "icons-bundle.tar.gz",
    checksums: iconsToolsChecksums[version],
    githubOrgRepo: "electron-userland/electron-builder-binaries",
  })
}

type IconConversionOptions = {
  inputFile: string
  outputFormat: "icns" | "ico" | "set"
  outDir: string
  iconsToolset: ToolsetConfig["icons"]
  resourcesDir: string
}

const VALID_OUTPUT_FORMATS = ["icns", "ico", "set"] as const

export async function runIconsTool({ inputFile, outputFormat, outDir, iconsToolset, resourcesDir }: IconConversionOptions): Promise<void> {
  if (!(VALID_OUTPUT_FORMATS as readonly string[]).includes(outputFormat)) {
    throw new InvalidConfigurationError(`Invalid icon output format: ${outputFormat}`)
  }
  const safeInput = sanitizeDirPath(inputFile)
  const safeOutDir = sanitizeDirPath(outDir)

  const toolsetPath = await getIconsToolsetPath(iconsToolset, resourcesDir)
  const scriptPath = sanitizeDirPath(path.resolve(toolsetPath, "icon-tool.js"), toolsetPath)
  if (!(await exists(scriptPath))) {
    throw new InvalidConfigurationError(`Icons tool not found at expected path: ${scriptPath}`)
  }
  // Serialize icon-tool spawns across processes: each reserves a large WebAssembly.Memory, andrunning many in parallel (e.g. across vitest workers) exhausts memory. See withIconsLock.
  await withIconsLock(() => exec(process.execPath, [scriptPath, `--input`, safeInput, `--format`, outputFormat, `--out`, safeOutDir], { shell: false }))
}
