// Adapted from https://github.com/electron/packager/pull/1806

import { spawn } from "builder-util"
import * as fs from "fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import * as plist from "plist"
import * as semver from "semver"

export interface AssetCatalogResult {
  assetCatalog: Buffer<ArrayBufferLike>
  icnsFile: Buffer<ArrayBufferLike>
}

/**
 * Generates an asset catalog and extra assets that are useful for packaging the app.
 * @param inputPath The path to the `.icon` file
 * @returns The asset catalog and extra assets
 */
export async function generateAssetCatalogForIcon(inputPath: string): Promise<AssetCatalogResult> {
  const acToolVersionOutput = await spawn("actool", ["--version"])
  const versionInfo = plist.parse(acToolVersionOutput) as Record<string, Record<string, string>>
  if (!versionInfo || !versionInfo["com.apple.actool.version"] || !versionInfo["com.apple.actool.version"]["short-bundle-version"]) {
    throw new Error("Unable to query actool version. Is Xcode 26 or higher installed? See output of the `actool --version` CLI command for more details.")
  }

  const acToolVersion = versionInfo["com.apple.actool.version"]["short-bundle-version"]
  if (!semver.gte(semver.coerce(acToolVersion)!, "26.0.0")) {
    throw new Error(`Unsupported actool version. Must be on actool 26.0.0 or higher but found ${acToolVersion}. Install XCode 26 or higher to get a supported version of actool.`)
  }

  const tmpDir = await fs.mkdtemp(path.resolve(os.tmpdir(), "icon-compile"))
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
    await fs.rm(tmpDir, {
      recursive: true,
      force: true,
    })
  }
}
