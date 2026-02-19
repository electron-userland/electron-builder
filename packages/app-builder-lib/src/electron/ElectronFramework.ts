import { asArray, copyDir, DO_NOT_USE_HARD_LINKS, executeAppBuilder, isEmptyOrSpaces, log, MAX_FILE_REQUESTS, statOrNull, unlinkIfExists } from "builder-util"
import { emptyDir, readdir, rename, rm } from "fs-extra"
import * as path from "path"
import asyncPool from "tiny-async-pool"
import { Configuration } from "../configuration"
import { BeforeCopyExtraFilesOptions, Framework, PrepareApplicationStageDirectoryOptions } from "../Framework"
import { Packager, Platform } from "../index"
import { LinuxPackager } from "../linuxPackager"
import { MacPackager } from "../macPackager"
import { getTemplatePath } from "../util/pathManager"
import { resolveFunction } from "../util/resolve"
import { createMacApp } from "./electronMac"
import { computeElectronVersion, getElectronVersionFromInstalled } from "./electronVersion"
import { addWinAsarIntegrity } from "./electronWin"
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
    if (options.asarIntegrity) {
      await addWinAsarIntegrity(executable, options.asarIntegrity)
    }
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
    .map(it => it.trim().toLowerCase())
    .filter(it => it.length > 0)
  if (!wantedLanguages.length) {
    return
  }

  const { dirs, langFileExt } = getLocalesConfig(options)
  // noinspection SpellCheckingInspection
  const deleteNonMatchedLanguages: (dir: string) => Promise<Promise<void>[] | undefined> = async (dir: string) => {
    const files = await readdir(dir)
    return files.map(async file => {
      if (path.extname(file) !== langFileExt) {
        return undefined
      }

      const language = path.basename(file, langFileExt).toLowerCase()
      const isWantedLocale = wantedLanguages.some(
        wantedLanguage =>
          // exact file
          wantedLanguage === language ||
          // prefix (e.g. "en" matches "en-US")
          wantedLanguage.startsWith(`${language}-`) ||
          // prefix (e.g. "en" matches "en_US")
          wantedLanguage.startsWith(`${language}_`)
      )
      if (isWantedLocale) {
        return undefined
      }
      return rm(path.join(dir, file), { recursive: true, force: true })
    })
  }
  const allDeletedFiles = (await Promise.all(dirs.map(deleteNonMatchedLanguages))).flat().filter(it => it != null)
  if (allDeletedFiles.length === 0) {
    log.warn({ electronLanguages: wantedLanguages }, "no locales found matching wanted languages, skipping cleanup")
    return
  }
  await asyncPool(MAX_FILE_REQUESTS, allDeletedFiles, it => it)

  function getLocalesConfig(options: BeforeCopyExtraFilesOptions) {
    const { appOutDir, packager } = options
    if (packager.platform === Platform.MAC) {
      return { dirs: [packager.getResourcesDir(appOutDir), packager.getMacOsElectronFrameworkResourcesDir(appOutDir)], langFileExt: ".lproj" }
    }
    return { dirs: [path.join(packager.getResourcesDir(appOutDir), "..", "locales")], langFileExt: ".pak" }
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

  constructor(
    readonly name: string,
    readonly version: string,
    readonly distMacOsAppName: string
  ) {}

  getDefaultIcon(platform: Platform) {
    if (platform === Platform.LINUX) {
      return path.join(getTemplatePath("icons"), "electron-linux")
    } else {
      // default icon is embedded into app skeleton
      return null
    }
  }

  async prepareApplicationStageDirectory(options: PrepareApplicationStageDirectoryOptions) {
    const downloadOptions = createDownloadOpts(options.packager.config, options.platformName, options.arch, this.version)
    const shouldCleanup = await unpack(options, downloadOptions, this.distMacOsAppName)
    await cleanupAfterUnpack(options, this.distMacOsAppName, shouldCleanup)
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

/**
 * Unpacks a custom or default Electron distribution into the app output directory.
 */
async function unpack(prepareOptions: PrepareApplicationStageDirectoryOptions, downloadOptions: ElectronDownloadOptions, distMacOsAppName: string): Promise<boolean> {
  const downloadUsingAdjustedConfig = (options: ElectronDownloadOptions) => {
    return executeAppBuilder(["unpack-electron", "--configuration", JSON.stringify([options]), "--output", appOutDir, "--distMacOsAppName", distMacOsAppName])
  }

  const copyUnpackedElectronDistribution = async (folderPath: string) => {
    log.info({ electronDist: log.filePath(folderPath) }, "using custom unpacked Electron distribution")
    const source = packager.getElectronSrcDir(folderPath)
    const destination = packager.getElectronDestinationDir(appOutDir)
    log.info({ source, destination }, "copying unpacked Electron")
    await emptyDir(appOutDir)
    await copyDir(source, destination, {
      isUseHardLink: DO_NOT_USE_HARD_LINKS,
    })
    return false
  }

  const selectElectron = async (filepath: string) => {
    const resolvedDist = path.isAbsolute(filepath) ? filepath : path.resolve(packager.projectDir, filepath)

    const electronDistStats = await statOrNull(resolvedDist)
    if (!electronDistStats) {
      throw new Error(
        `The specified electronDist does not exist: ${resolvedDist}. Please provide a valid path to the Electron zip file, cache directory, or electron build directory.`
      )
    }

    if (resolvedDist.endsWith(".zip")) {
      log.info({ zipFile: resolvedDist }, "using custom electronDist zip file")
      await downloadUsingAdjustedConfig({
        ...downloadOptions,
        cache: path.dirname(resolvedDist), // set custom directory to the zip file's directory
        customFilename: path.basename(resolvedDist), // set custom filename to the zip file's name
      })
      return false // do not clean up after unpacking, it's a custom bundle and we should respect its configuration/contents as required
    }

    if (electronDistStats.isDirectory()) {
      // backward compatibility: if electronDist is a directory, check for the default zip file inside it
      const files = await readdir(resolvedDist)
      if (files.includes(defaultZipName)) {
        log.info({ electronDist: log.filePath(resolvedDist) }, "using custom electronDist directory")
        await downloadUsingAdjustedConfig({
          ...downloadOptions,
          cache: resolvedDist,
          customFilename: defaultZipName,
        })
        return false
      }
      // if we reach here, it means the provided electronDist is neither a zip file nor a directory with the default zip file
      // e.g. we treat it as a custom already-unpacked Electron distribution
      return await copyUnpackedElectronDistribution(resolvedDist)
    }
    throw new Error(`The specified electronDist is neither a zip file nor a directory: ${resolvedDist}. Please provide a valid path to the Electron zip file or cache directory.`)
  }

  const { packager, appOutDir, platformName } = prepareOptions
  const { version, arch } = downloadOptions
  const defaultZipName = `electron-v${version}-${platformName}-${arch}.zip`

  const electronDist = packager.config.electronDist
  if (typeof electronDist === "string" && !isEmptyOrSpaces(electronDist)) {
    return selectElectron(electronDist)
  }

  let resolvedDist: string | null = null
  try {
    const electronDistHook: any = await resolveFunction(packager.appInfo.type, electronDist, "electronDist")
    resolvedDist = typeof electronDistHook === "function" ? await Promise.resolve(electronDistHook(prepareOptions)) : electronDistHook
  } catch (error: any) {
    log.warn({ error }, "Failed to resolve electronDist, using default unpack logic")
  }

  if (resolvedDist == null) {
    // if no custom electronDist is provided, use the default unpack logic
    log.debug(null, "no custom electronDist provided, unpacking default Electron distribution")
    await downloadUsingAdjustedConfig(downloadOptions)
    return true // indicates that we should clean up after unpacking
  }
  return selectElectron(resolvedDist)
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
