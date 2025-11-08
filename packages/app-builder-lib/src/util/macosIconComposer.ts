// Adapted from https://github.com/electron/packager/pull/1806

import { spawn } from "builder-util"
import * as fs from "fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import * as plist from "plist"
import * as semver from "semver"

export interface AssetCatalogResult {
  assetCatalog: Buffer
  icnsFile: Buffer
}

const INVALID_ACTOOL_VERSION_ERROR = new Error(
  "Failed to check actool version. Is Xcode 26 or higher installed? See output of the `actool --version` CLI command for more details."
)

async function checkActoolVersion(tmpDir: string) {
  const acToolOutputFileName = path.resolve(tmpDir, "actool.log")

  let versionInfo: Record<string, Record<string, string>> | undefined = undefined

  try {
    const acToolOutputFile = await fs.open(acToolOutputFileName, "w")
    await spawn("actool", ["--version"], { stdio: ["ignore", acToolOutputFile.fd, acToolOutputFile.fd] })
    const acToolVersionOutput = await fs.readFile(acToolOutputFileName, "utf8")
    versionInfo = plist.parse(acToolVersionOutput) as Record<string, Record<string, string>>
  } catch {
    throw INVALID_ACTOOL_VERSION_ERROR
  }

  if (!versionInfo || !versionInfo["com.apple.actool.version"] || !versionInfo["com.apple.actool.version"]["short-bundle-version"]) {
    throw INVALID_ACTOOL_VERSION_ERROR
  }

  const acToolVersion = versionInfo["com.apple.actool.version"]["short-bundle-version"]
  if (!semver.gte(semver.coerce(acToolVersion)!, "26.0.0")) {
    throw new Error(`Unsupported actool version. Must be on actool 26.0.0 or higher but found ${acToolVersion}. Install Xcode 26 or higher to get a supported version of actool.`)
  }
}

/**
 * Generates an asset catalog and extra assets that are useful for packaging the app.
 * @param inputPath The path to the `.icon` file
 * @returns The asset catalog and extra assets
 */
export async function generateAssetCatalogForIcon(inputPath: string): Promise<AssetCatalogResult> {
  const tmpDir = await fs.mkdtemp(path.resolve(os.tmpdir(), "icon-compile-"))
  const cleanup = async () => {
    await fs.rm(tmpDir, {
      recursive: true,
      force: true,
    })
  }

  try {
    await checkActoolVersion(tmpDir)
  } catch (error) {
    await cleanup()
    throw error
  }

  const iconPath = path.resolve(tmpDir, "Icon.icon")
  const outputPath = path.resolve(tmpDir, "out")

  try {
    await fs.cp(inputPath, iconPath, {
      recursive: true,
    })

    await fs.mkdir(outputPath, {
      recursive: true,
    })

    await spawn("actool", [
      iconPath,
      "--compile",
      outputPath,
      "--output-format",
      "human-readable-text",
      "--notices",
      "--warnings",
      "--output-partial-info-plist",
      path.resolve(outputPath, "assetcatalog_generated_info.plist"),
      "--app-icon",
      "Icon",
      "--include-all-app-icons",
      "--accent-color",
      "AccentColor",
      "--enable-on-demand-resources",
      "NO",
      "--development-region",
      "en",
      "--target-device",
      "mac",
      "--minimum-deployment-target",
      "26.0",
      "--platform",
      "macosx",
    ])

    const assetCatalog = await fs.readFile(path.resolve(outputPath, "Assets.car"))
    const icnsFile = await fs.readFile(path.resolve(outputPath, "Icon.icns"))

    return { assetCatalog, icnsFile }
  } finally {
    await cleanup()
  }
}
