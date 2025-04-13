import { asArray, copyDir, DO_NOT_USE_HARD_LINKS, executeAppBuilder, exists, log, MAX_FILE_REQUESTS, statOrNull, unlinkIfExists } from "builder-util"
import { MultiProgress } from "electron-publish/out/multiProgress"
import { emptyDir, readdir, rename, rm } from "fs-extra"
import * as fs from "fs/promises"
import * as path from "path"
import asyncPool from "tiny-async-pool"
import { WriteStream as TtyWriteStream } from "tty"
import { Configuration } from "../configuration"
import { BeforeCopyExtraFilesOptions, Framework, PrepareApplicationStageDirectoryOptions } from "../Framework"
import { Packager, Platform, PlatformPackager } from "../index"
import { LinuxPackager } from "../linuxPackager"
import { MacPackager } from "../macPackager"
import { getTemplatePath } from "../util/pathManager"
import { resolveFunction } from "../util/resolve"
import { createMacApp } from "./electronMac"
import { computeElectronVersion, getElectronVersionFromInstalled } from "./electronVersion"
import { addWinAsarIntegrity } from "./electronWin"
import injectFFMPEG from "./injectFFMPEG"
import { downloadArtifact } from "../util/electronGet"

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

async function beforeCopyExtraFiles(options: BeforeCopyExtraFilesOptions) {
  const { appOutDir, packager } = options
  const electronBranding = createBrandingOpts(packager.config)
  if (packager.platform === Platform.LINUX) {
    const linuxPackager = packager as LinuxPackager
    const executable = path.join(appOutDir, linuxPackager.executableName)
    await rm(executable, { recursive: true, force: true })
    await rename(path.join(appOutDir, electronBranding.projectName), executable)
  } else if (packager.platform === Platform.WINDOWS) {
    const executable = path.join(appOutDir, `${packager.appInfo.productFilename}.exe`)
    await rm(executable, { recursive: true, force: true })
    await rename(path.join(appOutDir, `${electronBranding.projectName}.exe`), executable)
    if (options.asarIntegrity) {
      await addWinAsarIntegrity(executable, options.asarIntegrity)
    }
  } else {
    await createMacApp(packager as MacPackager, appOutDir, options.asarIntegrity, (options.platformName as ElectronPlatformName) === "mas")
  }
}

async function removeUnusedLanguagesIfNeeded(packager: PlatformPackager<any>, localesDir: string) {
  const { config, platformSpecificBuildOptions } = packager
  const wantedLanguages = asArray(platformSpecificBuildOptions.electronLanguages || config.electronLanguages)
  if (!wantedLanguages.length) {
    return
  }

  const langFileExt = getLocalesExtension(packager)

  await asyncPool(MAX_FILE_REQUESTS, await readdir(localesDir), async file => {
    if (!file.endsWith(langFileExt)) {
      return
    }

    const language = file.substring(0, file.length - langFileExt.length)
    if (!wantedLanguages.includes(language)) {
      return fs.rm(path.join(localesDir, file), { recursive: true, force: true })
    }
    return
  })

  function getLocalesExtension(packager: PlatformPackager<any>) {
    if (packager.platform === Platform.MAC) {
      return ".lproj"
    } else {
      return ".pak"
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

  readonly progress = (process.stdout as TtyWriteStream).isTTY ? new MultiProgress() : null

  constructor(
    readonly name: string,
    readonly version: string,
    readonly productName: string
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
    await this.unpack(options, this.version, this.productName)
    if (options.packager.config.downloadAlternateFFmpeg) {
      await injectFFMPEG(this.progress, options, this.version, this.productName)
    }
  }

  beforeCopyExtraFiles(options: BeforeCopyExtraFilesOptions) {
    return beforeCopyExtraFiles(options)
  }

  private async unpack(prepareOptions: PrepareApplicationStageDirectoryOptions, version: string, productFilename: string) {
    const { platformName, arch } = prepareOptions
    const zipFileName = `electron-v${version}-${platformName}-${arch}.zip`

    const dist = await this.resolveElectronDist(prepareOptions, zipFileName)
    await this.copyOrDownloadElectronDist(dist, prepareOptions, version, zipFileName)

    await this.cleanupAfterUnpack(prepareOptions, productFilename)
  }

  private async copyOrDownloadElectronDist(dist: string | null, prepareOptions: PrepareApplicationStageDirectoryOptions, version: string, zipFileName: string) {
    const { packager, appOutDir, platformName, arch } = prepareOptions
    const {
      config: { electronDownload },
    } = packager
    if (dist != null) {
      const zipFilePath = path.join(dist, zipFileName)
      if (await exists(zipFilePath)) {
        log.info({ dist, zipFile: zipFileName }, "resolved electronDist")
        dist = zipFilePath
      } else if ((await statOrNull(dist))?.isDirectory()) {
        const source = path.isAbsolute(dist) ? dist : packager.getElectronSrcDir(dist)
        const destination = packager.getElectronDestinationDir(appOutDir)
        log.info({ source, destination }, "copying Electron")
        await emptyDir(appOutDir)
        await copyDir(source, destination, {
          isUseHardLink: DO_NOT_USE_HARD_LINKS,
        })
        dist = null
      } else {
        log.warn(
          { searchDir: log.filePath(dist), zipTarget: zipFileName },
          "custom `electronDist` provided but no zip or unpacked electron directory found; falling back to official electron app"
        )
      }
    } else {
      log.info({ zipFile: zipFileName }, "downloading")
      dist = await downloadArtifact(
        {
          electronDownload,
          artifactName: "electron",
          platformName,
          arch,
          version,
        },
        this.progress
      )
    }

    if (dist?.endsWith(".zip")) {
      log.debug(null, "extracting electron zip")
      await executeAppBuilder(["unzip", "--input", dist, "--output", appOutDir])
      log.info(null, "electron unpacked successfully")
    }
    return dist
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

  private async cleanupAfterUnpack(prepareOptions: PrepareApplicationStageDirectoryOptions, productFilename: string) {
    const out = prepareOptions.appOutDir
    const isMac = prepareOptions.packager.platform === Platform.MAC
    const resourcesPath = isMac ? path.join(out, `${productFilename}.app`, "Contents", "Resources") : path.join(out, "resources")
    const localesDir = isMac ? resourcesPath : path.resolve(out, "locales")

    return Promise.all([
      unlinkIfExists(path.join(resourcesPath, "default_app.asar")),
      unlinkIfExists(path.join(out, "version")),
      !isMac
        ? rename(path.join(out, "LICENSE"), path.join(out, "LICENSE.electron.txt")).catch(() => {
            /* ignore */
          })
        : Promise.resolve(),
      removeUnusedLanguagesIfNeeded(prepareOptions.packager, localesDir),
    ])
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
  return new ElectronFramework(branding.projectName, version, branding.productName)
}
