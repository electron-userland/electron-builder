import BluebirdPromise from "bluebird-lst"
import { asArray, executeAppBuilder, log } from "builder-util"
import { CONCURRENCY, copyDir, DO_NOT_USE_HARD_LINKS, statOrNull, unlinkIfExists } from "builder-util/out/fs"
import { emptyDir, readdir, rename } from "fs-extra"
import * as path from "path"
import { Configuration } from "../configuration"
import { BeforeCopyExtraFilesOptions, Framework, PrepareApplicationStageDirectoryOptions } from "../Framework"
import { Packager, Platform } from "../index"
import { LinuxPackager } from "../linuxPackager"
import MacPackager from "../macPackager"
import { getTemplatePath } from "../util/pathManager"
import { createMacApp } from "./electronMac"
import { computeElectronVersion, getElectronVersionFromInstalled } from "./electronVersion"
import * as fs from "fs/promises"
import injectFFMPEG from "./injectFFMPEG"

export type ElectronPlatformName = "darwin" | "linux" | "win32" | "mas"

/**
 * Electron distributables branding options.
 * @see [Electron BRANDING.json](https://github.com/electron/electron/blob/master/shell/app/BRANDING.json).
 */
export interface ElectronBrandingOptions {
  projectName?: string
  productName?: string
}

export function createBrandingOpts(opts: Configuration): Required<ElectronBrandingOptions> {
  return {
    projectName: opts.electronBranding?.projectName || "electron",
    productName: opts.electronBranding?.productName || "Electron",
  }
}

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
  const { appOutDir, packager } = options
  const electronBranding = createBrandingOpts(packager.config)
  if (packager.platform === Platform.LINUX) {
    const linuxPackager = packager as LinuxPackager
    const executable = path.join(appOutDir, linuxPackager.executableName)
    await rename(path.join(appOutDir, electronBranding.projectName), executable)
  } else if (packager.platform === Platform.WINDOWS) {
    const executable = path.join(appOutDir, `${packager.appInfo.productFilename}.exe`)
    await rename(path.join(appOutDir, `${electronBranding.projectName}.exe`), executable)
  } else {
    await createMacApp(packager as MacPackager, appOutDir, options.asarIntegrity, (options.platformName as ElectronPlatformName) === "mas")
  }
  await removeUnusedLanguagesIfNeeded(options)
}

async function removeUnusedLanguagesIfNeeded(options: BeforeCopyExtraFilesOptions) {
  const {
    packager: { config, platformSpecificBuildOptions },
  } = options
  const wantedLanguages = asArray(platformSpecificBuildOptions.electronLanguages || config.electronLanguages)
  if (!wantedLanguages.length) {
    return
  }

  const { dir, langFileExt } = getLocalesConfig(options)
  // noinspection SpellCheckingInspection
  await BluebirdPromise.map(
    readdir(dir),
    file => {
      if (!file.endsWith(langFileExt)) {
        return
      }

      const language = file.substring(0, file.length - langFileExt.length)
      if (!wantedLanguages.includes(language)) {
        return fs.rm(path.join(dir, file), { recursive: true, force: true })
      }
      return
    },
    CONCURRENCY
  )

  function getLocalesConfig(options: BeforeCopyExtraFilesOptions) {
    const { appOutDir, packager } = options
    if (packager.platform === Platform.MAC) {
      return { dir: packager.getResourcesDir(appOutDir), langFileExt: ".lproj" }
    } else {
      return { dir: path.join(packager.getResourcesDir(appOutDir), "..", "locales"), langFileExt: ".pak" }
    }
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

  constructor(readonly name: string, readonly version: string, readonly distMacOsAppName: string) {}

  getDefaultIcon(platform: Platform) {
    if (platform === Platform.LINUX) {
      return path.join(getTemplatePath("icons"), "electron-linux")
    } else {
      // default icon is embedded into app skeleton
      return null
    }
  }

  async prepareApplicationStageDirectory(options: PrepareApplicationStageDirectoryOptions) {
    await unpack(options, createDownloadOpts(options.packager.config, options.platformName, options.arch, this.version), this.distMacOsAppName)
    if (options.packager.config.downloadAlternateFFmpeg) {
      await injectFFMPEG(options, this.version)
    }
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
    } else {
      version = await computeElectronVersion(packager.projectDir)
    }
    configuration.electronVersion = version
  }

  const branding = createBrandingOpts(configuration)
  return new ElectronFramework(branding.projectName, version, `${branding.productName}.app`)
}

async function unpack(prepareOptions: PrepareApplicationStageDirectoryOptions, options: ElectronDownloadOptions, distMacOsAppName: string) {
  const { packager, appOutDir, platformName } = prepareOptions

  const electronDist = packager.config.electronDist
  let dist: string | undefined | null = typeof electronDist === "function" ? electronDist(prepareOptions) : electronDist
  if (dist != null) {
    const zipFile = `electron-v${options.version}-${platformName}-${options.arch}.zip`
    const resolvedDist = path.isAbsolute(dist) ? dist : path.resolve(packager.projectDir, dist)
    if ((await statOrNull(path.join(resolvedDist, zipFile))) != null) {
      log.info({ resolvedDist, zipFile }, "resolved electronDist")
      options.cache = resolvedDist
      dist = null
    }
  }

  let isFullCleanup = false
  if (dist == null) {
    await executeAppBuilder(["unpack-electron", "--configuration", JSON.stringify([options]), "--output", appOutDir, "--distMacOsAppName", distMacOsAppName])
  } else {
    isFullCleanup = true
    const source = packager.getElectronSrcDir(dist)
    const destination = packager.getElectronDestinationDir(appOutDir)
    log.info({ source, destination }, "copying Electron")
    await emptyDir(appOutDir)
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
    isMac
      ? Promise.resolve()
      : rename(path.join(out, "LICENSE"), path.join(out, "LICENSE.electron.txt")).catch(() => {
          /* ignore */
        }),
  ])
}
