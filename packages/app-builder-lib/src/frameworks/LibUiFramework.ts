import { InvalidConfigurationError } from "builder-util"
import { copy, emptyDir } from "fs-extra"
import { chmod, copyFile, mkdir, rename, writeFile } from "fs/promises"
import * as path from "path"
import { AfterPackContext } from "../configuration"
import { Platform } from "../core"
import { Framework, PrepareApplicationStageDirectoryOptions } from "../Framework"
import { LinuxPackager } from "../linuxPackager"
import { MacPackager } from "../macPackager"
import { downloadBuilderToolset } from "../util/electronGet"
import { savePlistFile } from "../util/plist"

/** Validates that a value is safe to embed in a double-quoted shell string (no metacharacters). */
export function validateShellEmbeddable(value: string, fieldName: string): void {
  // Allow letters, digits, dots, underscores, hyphens, forward slashes, and spaces.
  // Reject anything that could be interpreted as a shell metacharacter when embedded
  // inside a double-quoted string: $, `, ", \, and newlines.
  if (/[$`"\\\n]/.test(value)) {
    throw new InvalidConfigurationError(
      `${fieldName} contains characters that are not safe in shell scripts: ${JSON.stringify(value)}. ` +
        `Avoid $, backtick, double-quote, backslash, and newline characters.`
    )
  }
}

// LaunchUI version is independent of the Node.js version; this was the hardcoded default in the Go binary.
export const LAUNCHUI_DEFAULT_VERSION = "0.1.4-10.13.0"

export class LibUiFramework implements Framework {
  readonly name: string = "libui"
  // noinspection JSUnusedGlobalSymbols
  readonly macOsDefaultTargets = ["dmg"]

  readonly defaultAppIdPrefix: string = "com.libui."

  // noinspection JSUnusedGlobalSymbols
  readonly isCopyElevateHelper = false

  // noinspection JSUnusedGlobalSymbols
  readonly isNpmRebuildRequired = false

  constructor(
    readonly version: string,
    readonly macOsProductName: string,
    protected readonly isUseLaunchUi: boolean,
    protected readonly launchUiVersion: string = LAUNCHUI_DEFAULT_VERSION
  ) {}

  get distMacOsAppName(): string {
    return `${this.macOsProductName}.app`
  }

  async prepareApplicationStageDirectory(options: PrepareApplicationStageDirectoryOptions) {
    await emptyDir(options.appOutDir)

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
    const macMain = options.packager.info.metadata.main || "index.js"
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
    const linuxMain = options.packager.info.metadata.main || "index.js"
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
    const userMain = packager.info.metadata.main || "index.js"
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
  const extractDir = await downloadBuilderToolset({ releaseName, filenameWithExt, overrideUrl })
  return path.join(extractDir, binaryRelPath)
}

export type LaunchUiDownloadParams = {
  releaseName: string
  filenameWithExt: string
  githubOrgRepo: string
}

export function getLaunchUiDownloadParams(version: string, platform: Platform, arch: string): LaunchUiDownloadParams {
  const launchPlatform = platform === Platform.MAC ? "mac" : platform === Platform.WINDOWS ? "win32" : "linux"
  return {
    releaseName: `v${version}`,
    filenameWithExt: `launchui-v${version}-${launchPlatform}-${arch}.7z`,
    githubOrgRepo: "develar/launchui",
  }
}

export async function downloadLaunchUiDir(version: string, platform: Platform, arch: string): Promise<string> {
  return downloadBuilderToolset(getLaunchUiDownloadParams(version, platform, arch))
}
