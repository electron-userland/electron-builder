import { asArray, copyDir, DO_NOT_USE_HARD_LINKS, executeAppBuilder, exists, log, MAX_FILE_REQUESTS, statOrNull, unlinkIfExists } from "builder-util"
import { MultiProgress } from "electron-publish/out/multiProgress"
import { emptyDir, readdir, rename } from "fs-extra"
import * as fs from "fs/promises"
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
import { downloadArtifact } from "../util/electronGet"
import { FFMPEGInjector } from "./injectFFMPEG"

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

class ElectronFramework implements Framework {
  // noinspection JSUnusedGlobalSymbols
  readonly macOsDefaultTargets = ["zip", "dmg"]
  // noinspection JSUnusedGlobalSymbols
  readonly defaultAppIdPrefix = "com.electron."
  // noinspection JSUnusedGlobalSymbols
  readonly isCopyElevateHelper = true
  // noinspection JSUnusedGlobalSymbols
  readonly isNpmRebuildRequired = true

  readonly progress = process.stdout?.isTTY ? new MultiProgress() : null

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
    await this.unpack(options)
    if (options.packager.config.downloadAlternateFFmpeg) {
      await new FFMPEGInjector(this.progress, options, this.version, createBrandingOpts(options.packager.config)).inject()
    }
  }

  async beforeCopyExtraFiles(options: BeforeCopyExtraFilesOptions) {
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
  }

  private async unpack(prepareOptions: PrepareApplicationStageDirectoryOptions) {
    const { platformName, arch } = prepareOptions
    const zipFileName = `electron-v${this.version}-${platformName}-${arch}.zip`

    const dist = await this.resolveElectronDist(prepareOptions, zipFileName)

    await this.copyOrDownloadElectronDist(dist, prepareOptions, zipFileName)

    await this.removeFiles(prepareOptions)
  }

  private async resolveElectronDist(prepareOptions: PrepareApplicationStageDirectoryOptions, zipFileName: string) {
    const { packager } = prepareOptions

    const electronDist = packager.config.electronDist || null
    let dist: string | null = null
    // check if supplied a custom electron distributable/fork/predownloaded directory
    if (typeof electronDist === "string") {
      let resolvedDist: string
      // check if custom electron hook file for import  resolving
      if ((await statOrNull(electronDist))?.isFile() && !electronDist.endsWith(zipFileName)) {
        const customElectronDist = await resolveFunction<string | ((options: PrepareApplicationStageDirectoryOptions) => string)>(
          packager.appInfo.type,
          electronDist,
          "electronDist"
        )
        resolvedDist = await Promise.resolve(typeof customElectronDist === "function" ? customElectronDist(prepareOptions) : customElectronDist)
      } else {
        resolvedDist = electronDist
      }
      dist = path.isAbsolute(resolvedDist) ? resolvedDist : path.resolve(packager.projectDir, resolvedDist)
    }
    return dist
  }

  private async copyOrDownloadElectronDist(dist: string | null, prepareOptions: PrepareApplicationStageDirectoryOptions, zipFileName: string) {
    const { packager, appOutDir, platformName, arch } = prepareOptions
    const {
      config: { electronDownload },
    } = packager

    if (dist != null) {
      const source = path.isAbsolute(dist) ? dist : packager.getElectronSrcDir(dist)
      const zipFilePath = path.join(source, zipFileName)

      const stats = await statOrNull(source)
      if (stats?.isFile() && source.endsWith(".zip")) {
        log.info({ dist: log.filePath(source) }, "using Electron zip")
        dist = source
      } else if (await exists(zipFilePath)) {
        log.info({ dist: log.filePath(zipFilePath) }, "using Electron zip")
        dist = zipFilePath
      } else if (stats?.isDirectory()) {
        const destination = packager.getElectronDestinationDir(appOutDir)
        log.info({ source: log.filePath(source), destination: log.filePath(destination) }, "copying Electron build directory")
        await emptyDir(appOutDir)
        await copyDir(source, destination, {
          isUseHardLink: DO_NOT_USE_HARD_LINKS,
        })
        dist = null
      } else {
        const errorMessage = "Please provide a valid path to the Electron zip file, cache directory, or Electron build directory."
        log.error({ searchDir: log.filePath(source) }, errorMessage)
        throw new Error(errorMessage)
      }
    } else {
      log.info({ zipFile: zipFileName }, "downloading Electron")
      dist = await downloadArtifact(
        {
          electronDownload,
          artifactName: "electron",
          platformName,
          arch,
          version: this.version,
        },
        this.progress
      )
    }

    if (dist?.endsWith(".zip")) {
      await this.extractAndRenameElectron(dist, appOutDir)
    }
    return dist
  }

  private async extractAndRenameElectron(dist: string, appOutDir: string) {
    log.debug(null, "extracting Electron zip")
    await executeAppBuilder(["unzip", "--input", dist, "--output", appOutDir])
    log.debug(null, "Electron unpacked successfully")
  }

  private async removeFiles(prepareOptions: PrepareApplicationStageDirectoryOptions) {
    const out = prepareOptions.appOutDir
    const isMac = prepareOptions.packager.platform === Platform.MAC
    let resourcesPath = path.resolve(out, "resources")
    if (isMac) {
      resourcesPath = path.resolve(out, this.distMacOsAppName, "Contents", "Resources")
    }

    await unlinkIfExists(path.join(resourcesPath, "default_app.asar"))
    await unlinkIfExists(path.join(resourcesPath, "inspector", ".htaccess"))
    await unlinkIfExists(path.join(out, "version"))
    if (!isMac) {
      await rename(path.join(out, "LICENSE"), path.join(out, "LICENSE.electron.txt")).catch(() => {
        /* ignore */
      })
    }
    await this.removeUnusedLanguagesIfNeeded(prepareOptions, resourcesPath)
  }

  async removeUnusedLanguagesIfNeeded(options: PrepareApplicationStageDirectoryOptions, resourcesPath: string) {
    const {
      packager: { config, platformSpecificBuildOptions, platform },
    } = options
    const wantedLanguages = asArray(platformSpecificBuildOptions.electronLanguages || config.electronLanguages)
    if (!wantedLanguages.length) {
      return
    }

    const { dirs, langFileExt } = this.getLocalesConfig(platform, resourcesPath)
    for (const dir of dirs) {
      const contents = await readdir(dir)
      await asyncPool(MAX_FILE_REQUESTS, contents, async file => {
        if (path.extname(file) !== langFileExt) {
          return
        }

        const language = path.basename(file, langFileExt)
        if (!wantedLanguages.includes(language)) {
          return fs.rm(path.join(dir, file), { recursive: true, force: true })
        }
        return
      })
    }
  }

  private getLocalesConfig(platform: Platform, resourcesPath: string) {
    if (platform === Platform.MAC) {
      const frameworkName = `${path.basename(this.distMacOsAppName, ".app")} Framework.framework`
      return {
        dirs: [resourcesPath, path.resolve(resourcesPath, "..", "Frameworks", frameworkName, "Resources")],
        langFileExt: ".lproj",
      }
    }
    return { dirs: [path.resolve(resourcesPath, "..", "locales")], langFileExt: ".pak" }
  }
}
