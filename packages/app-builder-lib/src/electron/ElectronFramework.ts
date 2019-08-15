import BluebirdPromise from "bluebird-lst"
import { asArray, executeAppBuilder, log } from "builder-util"
import { CONCURRENCY, copyDir, DO_NOT_USE_HARD_LINKS, statOrNull, unlinkIfExists } from "builder-util/out/fs"
import { emptyDir, readdir, remove, rename } from "fs-extra"
import { Lazy } from "lazy-val"
import * as path from "path"
import { Configuration } from "../configuration"
import { BeforeCopyExtraFilesOptions, Framework, PrepareApplicationStageDirectoryOptions } from "../Framework"
import { ElectronPlatformName, Packager, Platform } from "../index"
import { LinuxPackager } from "../linuxPackager"
import MacPackager from "../macPackager"
import { isSafeToUnpackElectronOnRemoteBuildServer } from "../platformPackager"
import { getTemplatePath } from "../util/pathManager"
import { createMacApp } from "./electronMac"
import { computeElectronVersion, getElectronVersionFromInstalled } from "./electronVersion"

export type ElectronPlatformName = "darwin" | "linux" | "win32" | "mas"

export interface ElectronDownloadOptions {
  // https://github.com/electron-userland/electron-builder/issues/3077
  // must be optional
  version?: string

  /**
   * The [cache location](https://github.com/electron-userland/electron-download#cache-location).
   */
  cache?: string | null

  /**
   * The mirror.
   */
  mirror?: string | null

  /** @private */
  customDir?: string | null
  /** @private */
  customFilename?: string | null

  strictSSL?: boolean
  isVerifyChecksum?: boolean

  platform?: ElectronPlatformName
  arch?: string
}

function createDownloadOpts(opts: Configuration, platform: ElectronPlatformName, arch: string, electronVersion: string): ElectronDownloadOptions {
  return {
    platform,
    arch,
    version: electronVersion,
    ...opts.electronDownload,
  }
}

async function beforeCopyExtraFiles(options: BeforeCopyExtraFilesOptions) {
  const packager = options.packager
  const appOutDir = options.appOutDir
  if (packager.platform === Platform.LINUX) {
    if (!isSafeToUnpackElectronOnRemoteBuildServer(packager)) {
      const linuxPackager = (packager as LinuxPackager)
      const executable = path.join(appOutDir, linuxPackager.executableName)
      await rename(path.join(appOutDir, "electron"), executable)
    }
  }
  else if (packager.platform === Platform.WINDOWS) {
    const executable = path.join(appOutDir, `${packager.appInfo.productFilename}.exe`)
    await rename(path.join(appOutDir, "electron.exe"), executable)
  }
  else {
    await createMacApp(packager as MacPackager, appOutDir, options.asarIntegrity, (options.platformName as ElectronPlatformName) === "mas")

    const wantedLanguages = asArray(packager.platformSpecificBuildOptions.electronLanguages)
    if (wantedLanguages.length === 0) {
      return
    }

    // noinspection SpellCheckingInspection
    const langFileExt = ".lproj"
    const resourcesDir = packager.getResourcesDir(appOutDir)
    await BluebirdPromise.map(readdir(resourcesDir), file => {
      if (!file.endsWith(langFileExt)) {
        return
      }

      const language = file.substring(0, file.length - langFileExt.length)
      if (!wantedLanguages.includes(language)) {
        return remove(path.join(resourcesDir, file))
      }
      return
    }, CONCURRENCY)
  }
}

class ElectronFramework implements Framework {
  // noinspection JSUnusedGlobalSymbols
  readonly macOsDefaultTargets = ["zip", "dmg"]
  // noinspection JSUnusedGlobalSymbols
  readonly defaultAppIdPrefix = "com.electron."
  // noinspection JSUnusedGlobalSymbols
  readonly isCopyElevateHelper = true
  // noinspection JSUnusedGlobalSymbols
  readonly isNpmRebuildRequired = true

  constructor(readonly name: string, readonly version: string, readonly distMacOsAppName: string) {
  }

  getDefaultIcon(platform: Platform) {
    if (platform === Platform.LINUX) {
      return path.join(getTemplatePath("icons"), "electron-linux")
    }
    else {
      // default icon is embedded into app skeleton
      return null
    }
  }

  prepareApplicationStageDirectory(options: PrepareApplicationStageDirectoryOptions) {
    return unpack(options, createDownloadOpts(options.packager.config, options.platformName, options.arch, this.version), this.distMacOsAppName)
  }

  beforeCopyExtraFiles(options: BeforeCopyExtraFilesOptions) {
    return beforeCopyExtraFiles(options)
  }
}

export async function createElectronFrameworkSupport(configuration: Configuration, packager: Packager): Promise<Framework> {
  let version = configuration.electronVersion
  if (version == null) {
    // for prepacked app asar no dev deps in the app.asar
    if (packager.isPrepackedAppAsar) {
      version = await getElectronVersionFromInstalled(packager.projectDir)
      if (version == null) {
        throw new Error(`Cannot compute electron version for prepacked asar`)
      }
    }
    else {
      version = await computeElectronVersion(packager.projectDir, new Lazy(() => Promise.resolve(packager.metadata)))
    }
    configuration.electronVersion = version
  }

  return new ElectronFramework("electron", version, "Electron.app")
}

async function unpack(prepareOptions: PrepareApplicationStageDirectoryOptions, options: ElectronDownloadOptions, distMacOsAppName: string) {
  const packager = prepareOptions.packager
  const out = prepareOptions.appOutDir

  let dist: string | null | undefined = packager.config.electronDist
  if (dist != null) {
    const zipFile = `electron-v${options.version}-${prepareOptions.platformName}-${options.arch}.zip`
    const resolvedDist = path.resolve(packager.projectDir, dist)
    if ((await statOrNull(path.join(resolvedDist, zipFile))) != null) {
      options.cache = resolvedDist
      dist = null
    }
  }

  let isFullCleanup = false
  if (dist == null) {
    if (isSafeToUnpackElectronOnRemoteBuildServer(packager)) {
      return
    }

    await executeAppBuilder(["unpack-electron", "--configuration", JSON.stringify([options]), "--output", out, "--distMacOsAppName", distMacOsAppName])
  }
  else {
    isFullCleanup = true
    const source = packager.getElectronSrcDir(dist)
    const destination = packager.getElectronDestinationDir(out)
    log.info({source, destination}, "copying Electron")
    await emptyDir(out)
    await copyDir(source, destination, {
      isUseHardLink: DO_NOT_USE_HARD_LINKS,
    })
  }

  await cleanupAfterUnpack(prepareOptions, distMacOsAppName, isFullCleanup)
}

function cleanupAfterUnpack(prepareOptions: PrepareApplicationStageDirectoryOptions, distMacOsAppName: string, isFullCleanup: boolean) {
  const out = prepareOptions.appOutDir
  const isMac = prepareOptions.packager.platform === Platform.MAC
  const resourcesPath = isMac ? path.join(out, distMacOsAppName, "Contents", "Resources") : path.join(out, "resources")

  return Promise.all([
    isFullCleanup ? unlinkIfExists(path.join(resourcesPath, "default_app.asar")) : Promise.resolve(),
    isFullCleanup ? unlinkIfExists(path.join(out, "version")) : Promise.resolve(),
    isMac ? Promise.resolve() : rename(path.join(out, "LICENSE"), path.join(out, "LICENSE.electron.txt")).catch(() => {/* ignore */}),
  ])
}