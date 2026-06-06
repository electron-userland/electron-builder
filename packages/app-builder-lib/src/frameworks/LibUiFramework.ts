<<<<<<< HEAD
import { InvalidConfigurationError } from "builder-util"
import _fsExtra from "fs-extra"
const { copy, emptyDir } = _fsExtra
import { chmod, copyFile, mkdir, rename, writeFile } from "fs/promises"
import * as https from "https"
=======
import { executeAppBuilder } from "builder-util"
import fsExtra from "fs-extra"
import { chmod, mkdir, rename, writeFile } from "fs/promises"
>>>>>>> 8a2e4e97f (tmp save. migrating fs-extra to namespace import)
import * as path from "path"
import { AfterPackContext } from "../configuration.js"
import { Platform } from "../core.js"
import { Framework, PrepareApplicationStageDirectoryOptions } from "../Framework.js"
import { LinuxPackager } from "../linuxPackager.js"
import { MacPackager } from "../macPackager.js"
<<<<<<< HEAD
import { downloadBuilderToolset } from "../util/electronGet.js"
import { savePlistFile } from "../util/plist.js"

/** Validates that a value is safe to embed in a double-quoted shell string (no metacharacters). */
export function validateShellEmbeddable(value: string, fieldName: string): void {
  // Allow letters, digits, dots, underscores, hyphens, forward slashes, and spaces.
  // Reject anything that could be interpreted as a shell metacharacter when embedded
  // inside a double-quoted string: $, `, ", \, and newlines.
  if (/[$`"\\\n]/.test(value)) {
    throw new InvalidConfigurationError(
      `${fieldName} contains characters that are not safe in shell scripts: ${JSON.stringify(value)}. ` + `Avoid $, backtick, double-quote, backslash, and newline characters.`
    )
  }
}

// LaunchUI version is independent of the Node.js version; this was the hardcoded default in the Go binary.
// https://github.com/develar/app-builder/blob/master/pkg/package-format/proton-native/protonNative.go#L105-L136
export const LAUNCHUI_DEFAULT_VERSION = "0.1.4-10.13.0"
// https://github.com/develar/launchui/releases/tag/v0.1.4-10.13.0
const launchUiChecksums = {
  "launchui-v0.1.4-10.13.0-linux-x64.7z": "4fb5cd8ed79e1e24e0f5cf4b26107f2fa6f6fd8dc48ecd18fb6f48f3ccfe9ee6",
  "launchui-v0.1.4-10.13.0-win32-ia32.7z": "682734da3d817ac365093c6c8ef3d9a70cc3f2a809e4588cb12a311358a68a2d",
  "launchui-v0.1.4-10.13.0-win32-x64.7z": "2f26629c5f5c12baeff272ac7855a1df7f27621cce782b79965f9a9b5eccc359",
}
=======
import { savePlistFile } from "../util/plist.js"
>>>>>>> d26567f58 (tmp save)

export class LibUiFramework implements Framework {
  readonly name: string = "libui"
  // noinspection JSUnusedGlobalSymbols
  readonly macOsDefaultTargets = ["dmg"]

  readonly defaultAppIdPrefix: string = "com.libui."

  // noinspection JSUnusedGlobalSymbols
  readonly isCopyElevateHelper = false

  // noinspection JSUnusedGlobalSymbols
  readonly isNpmRebuildRequired = false

  readonly launchUiVersion: string = LAUNCHUI_DEFAULT_VERSION

  constructor(
    readonly version: string,
    readonly macOsProductName: string,
    protected readonly isUseLaunchUi: boolean
  ) {}

  get distMacOsAppName(): string {
    return `${this.macOsProductName}.app`
  }

  async prepareApplicationStageDirectory(options: PrepareApplicationStageDirectoryOptions) {
    await fsExtra.emptyDir(options.appOutDir)

    const packager = options.packager
    const platform = packager.platform

    if (this.isUseLaunchUiForPlatform(platform)) {
      const appOutDir = options.appOutDir
      const launchUiDir = await downloadLaunchUiDir(this.launchUiVersion, platform, options.arch)
      await copy(launchUiDir, appOutDir)
      const skeletonExe = `launchui${platform === Platform.WINDOWS ? ".exe" : ""}`
      const executableName = `${packager.appInfo.productFilename}${platform === Platform.WINDOWS ? ".exe" : ""}`
      await rename(path.join(appOutDir, skeletonExe), path.join(appOutDir, executableName))
      return
    }

    if (platform === Platform.MAC) {
      await this.prepareMacosApplicationStageDirectory(packager as MacPackager, options)
    } else if (platform === Platform.LINUX) {
      await this.prepareLinuxApplicationStageDirectory(options)
    }
  }

  private async prepareMacosApplicationStageDirectory(packager: MacPackager, options: PrepareApplicationStageDirectoryOptions) {
    const appContentsDir = path.join(options.appOutDir, this.distMacOsAppName, "Contents")
    await mkdir(path.join(appContentsDir, "Resources"), { recursive: true })
    await mkdir(path.join(appContentsDir, "MacOS"), { recursive: true })
    const nodeBinaryMac = await downloadNodeJsBinary(this.version, Platform.MAC, "x64")
    await copyFile(nodeBinaryMac, path.join(appContentsDir, "MacOS", "node"))
    await chmod(path.join(appContentsDir, "MacOS", "node"), 0o755)

    const appPlist: any = {
      // https://github.com/albe-rosado/create-proton-app/issues/13
      NSHighResolutionCapable: true,
    }
    await packager.applyCommonInfo(appPlist, appContentsDir)
    await savePlistFile(path.join(appContentsDir, "Info.plist"), appPlist)
    const macMain = options.packager.metadata.main || "index.js"
    validateShellEmbeddable(macMain, "package.json main")
    await writeExecutableMain(
      path.join(appContentsDir, "MacOS", appPlist.CFBundleExecutable),
      `#!/bin/sh
  DIR=$(dirname "$0")
  "$DIR/node" "$DIR/../Resources/app/${macMain}"
  `
    )
  }

  private async prepareLinuxApplicationStageDirectory(options: PrepareApplicationStageDirectoryOptions) {
    const appOutDir = options.appOutDir
    const nodeBinaryLinux = await downloadNodeJsBinary(this.version, Platform.LINUX, options.arch)
    await copyFile(nodeBinaryLinux, path.join(appOutDir, "node"))
    await chmod(path.join(appOutDir, "node"), 0o755)
    const mainPath = path.join(appOutDir, (options.packager as LinuxPackager).executableName)
    const linuxMain = options.packager.metadata.main || "index.js"
    validateShellEmbeddable(linuxMain, "package.json main")
    await writeExecutableMain(
      mainPath,
      `#!/bin/sh
  DIR=$(dirname "$0")
  "$DIR/node" "$DIR/app/${linuxMain}"
  `
    )
  }

  async afterPack(context: AfterPackContext) {
    const packager = context.packager
    if (!this.isUseLaunchUiForPlatform(packager.platform)) {
      return
    }

    // LaunchUI requires main.js, rename if need
    const userMain = packager.metadata.main || "index.js"
    if (userMain === "main.js") {
      return
    }

    await rename(path.join(context.appOutDir, "app", userMain), path.join(context.appOutDir, "app", "main.js"))
  }

  getMainFile(platform: Platform): string | null {
    return this.isUseLaunchUiForPlatform(platform) ? "main.js" : null
  }

  private isUseLaunchUiForPlatform(platform: Platform) {
    return platform === Platform.WINDOWS || (this.isUseLaunchUi && platform === Platform.LINUX)
  }

  getExcludedDependencies(platform: Platform): Array<string> | null {
    // part of launchui
    return this.isUseLaunchUiForPlatform(platform) ? ["libui-node"] : null
  }
}

async function writeExecutableMain(file: string, content: string) {
  await writeFile(file, content, { mode: 0o755 })
  await chmod(file, 0o755)
}

export type NodeJsDownloadParams = {
  releaseName: string
  filenameWithExt: string
  overrideUrl: string
  binaryRelPath: string
}

export function getNodeJsDownloadParams(version: string, platform: Platform, arch: string): NodeJsDownloadParams {
  const isWindows = platform === Platform.WINDOWS
  const nodePlatform = isWindows ? "win" : platform === Platform.MAC ? "darwin" : "linux"
  const nodeArch = isWindows && arch === "ia32" ? "x86" : arch
  const format = isWindows ? "zip" : "tar.gz"
  const filenameWithExt = `node-v${version}-${nodePlatform}-${nodeArch}.${format}`
  // tar.gz: strip:1 moves node-v.../bin/node → bin/node in extractDir
  // zip: no strip, node.exe lives under the top-level dir node-v{version}-win-{arch}/
  const binaryRelPath = isWindows ? path.join(`node-v${version}-win-${nodeArch}`, "node.exe") : path.join("bin", "node")
  return { releaseName: `nodejs-v${version}`, filenameWithExt, overrideUrl: `https://nodejs.org/dist/v${version}`, binaryRelPath }
}

export async function downloadNodeJsBinary(version: string, platform: Platform, arch: string): Promise<string> {
  const { releaseName, filenameWithExt, overrideUrl, binaryRelPath } = getNodeJsDownloadParams(version, platform, arch)
  const sha256 = await fetchNodeJsChecksum(version, filenameWithExt)
  const checksums = { [filenameWithExt]: sha256 }
  const extractDir = await downloadBuilderToolset({ releaseName, filenameWithExt, overrideUrl, checksums })
  return path.join(extractDir, binaryRelPath)
}

/**
 * Fetches the SHA-256 hex digest for a specific Node.js distribution file from
 * the official nodejs.org SHASUMS256.txt, preventing MITM substitution attacks.
 */
export async function fetchNodeJsChecksum(version: string, filename: string): Promise<string> {
  const url = `https://nodejs.org/dist/v${version}/SHASUMS256.txt`
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "electron-builder" } }, res => {
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode} fetching Node.js SHASUMS256.txt for v${version}`))
          return
        }
        const chunks: Buffer[] = []
        res.on("data", (c: Buffer) => chunks.push(c))
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8")
          for (const line of text.split("\n")) {
            const m = line.match(/^([0-9a-f]{64})\s+(.+)$/)
            if (m != null && m[2].trim() === filename) {
              resolve(m[1])
              return
            }
          }
          reject(new Error(`No checksum for ${filename} in Node.js v${version} SHASUMS256.txt`))
        })
        res.on("error", reject)
      })
      .on("error", reject)
  })
}

export type LaunchUiDownloadParams = {
  releaseName: string
  filenameWithExt: string
  githubOrgRepo: string
  checksums: Record<string, string>
}

export function getLaunchUiDownloadParams(version: string, platform: Platform, arch: string): LaunchUiDownloadParams {
  const launchPlatform = platform === Platform.MAC ? "mac" : platform === Platform.WINDOWS ? "win32" : "linux"
  return {
    releaseName: `v${version}`,
    filenameWithExt: `launchui-v${version}-${launchPlatform}-${arch}.7z`,
    githubOrgRepo: "develar/launchui",
    checksums: launchUiChecksums,
  }
}

export async function downloadLaunchUiDir(version: string, platform: Platform, arch: string): Promise<string> {
  return downloadBuilderToolset(getLaunchUiDownloadParams(version, platform, arch))
}
