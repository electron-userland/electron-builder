import BluebirdPromise from "bluebird-lst"
import { asArray, executeAppBuilder, log } from "builder-util"
import { CONCURRENCY, copyDir, DO_NOT_USE_HARD_LINKS, statOrNull, unlinkIfExists } from "builder-util/out/fs"
import { emptyDir, readdir, remove, rename } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import * as semver from "semver"
import { Configuration } from "../configuration"
import { BeforeCopyExtraFilesOptions, Framework, PrepareApplicationStageDirectoryOptions } from "../Framework"
import { ElectronPlatformName, Packager, Platform } from "../index"
import { LinuxPackager } from "../linuxPackager"
import MacPackager from "../macPackager"
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

async function beforeCopyExtraFiles(options: BeforeCopyExtraFilesOptions, isClearExecStack: boolean) {
  const packager = options.packager
  const appOutDir = options.appOutDir
  if (packager.platform === Platform.LINUX) {
    const linuxPackager = (packager as LinuxPackager)
    const executable = path.join(appOutDir, linuxPackager.executableName)
    await rename(path.join(appOutDir, packager.electronDistExecutableName), executable)

    if (isClearExecStack) {
      try {
        await executeAppBuilder(["clear-exec-stack", "--input", executable])
      }
      catch (e) {
        log.debug({error: e}, "cannot clear exec stack")
      }
    }
  }
  else if (packager.platform === Platform.WINDOWS) {
    const executable = path.join(appOutDir, `${packager.appInfo.productFilename}.exe`)
    await rename(path.join(appOutDir, `${packager.electronDistExecutableName}.exe`), executable)
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

export async function createElectronFrameworkSupport(configuration: Configuration, packager: Packager): Promise<Framework> {
  if (configuration.muonVersion != null) {
    const distMacOsAppName = "Brave.app"
    return {
      name: "muon",
      isDefaultAppIconProvided: true,
      macOsDefaultTargets: ["zip", "dmg"],
      defaultAppIdPrefix: "com.electron.",
      version: configuration.muonVersion!!,
      distMacOsAppName,
      prepareApplicationStageDirectory: options => {
        return unpack(options, {
          mirror: "https://github.com/brave/muon/releases/download/v",
          customFilename: `brave-v${options.version}-${options.platformName}-${options.arch}.zip`,
          isVerifyChecksum: false,
          ...createDownloadOpts(options.packager.config, options.platformName, options.arch, options.version),
        }, distMacOsAppName)
      },
      isNpmRebuildRequired: true,
      beforeCopyExtraFiles: options => {
        return beforeCopyExtraFiles(options, false)
      },
    }
  }

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

  const distMacOsAppName = "Electron.app"
  return {
    isDefaultAppIconProvided: true,
    macOsDefaultTargets: ["zip", "dmg"],
    defaultAppIdPrefix: "com.electron.",
    name: "electron",
    version,
    distMacOsAppName,
    isNpmRebuildRequired: true,
    prepareApplicationStageDirectory: options => unpack(options, createDownloadOpts(options.packager.config, options.platformName, options.arch, version!!), distMacOsAppName),
    beforeCopyExtraFiles: options => {
      return beforeCopyExtraFiles(options, semver.lte(version || "1.8.3", "1.8.3"))
    },
  }
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