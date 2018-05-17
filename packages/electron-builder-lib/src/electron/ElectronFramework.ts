import { path7za } from "7zip-bin"
import BluebirdPromise from "bluebird-lst"
import { debug7zArgs, exec, isEnvTrue, log, spawn, asArray } from "builder-util"
import { copyDir, DO_NOT_USE_HARD_LINKS, statOrNull, CONCURRENCY, unlinkIfExists } from "builder-util/out/fs"
import { chmod, emptyDir, readdir, remove, rename } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { executeAppBuilder } from "builder-util/out/util"
import * as semver from "semver"
import { AsarIntegrity } from "../asar/integrity"
import { Configuration, ElectronDownloadOptions } from "../configuration"
import { Platform } from "../core"
import { Framework, PrepareApplicationStageDirectoryOptions } from "../Framework"
import { LinuxPackager } from "../linuxPackager"
import MacPackager from "../macPackager"
import { Packager } from "../packager"
import { PlatformPackager } from "../platformPackager"
import { createMacApp } from "./electronMac"
import { computeElectronVersion, getElectronVersionFromInstalled } from "./electronVersion"

interface InternalElectronDownloadOptions extends ElectronDownloadOptions {
  version: string
  platform: string
  arch: string
}

function createDownloadOpts(opts: Configuration, platform: string, arch: string, electronVersion: string): InternalElectronDownloadOptions {
  return {
    platform,
    arch,
    version: electronVersion,
    ...opts.electronDownload,
  }
}

async function beforeCopyExtraFiles(packager: PlatformPackager<any>, appOutDir: string, asarIntegrity: AsarIntegrity | null, isClearExecStack: boolean) {
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
    await createMacApp(packager as MacPackager, appOutDir, asarIntegrity)

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
          verifyChecksum: false,
          ...createDownloadOpts(options.packager.config, options.platformName, options.arch, options.version),
        }, distMacOsAppName)
      },
      isNpmRebuildRequired: true,
      beforeCopyExtraFiles: (packager: PlatformPackager<any>, appOutDir: string, asarIntegrity: AsarIntegrity | null) => {
        return beforeCopyExtraFiles(packager, appOutDir, asarIntegrity, false)
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
    beforeCopyExtraFiles: (packager: PlatformPackager<any>, appOutDir: string, asarIntegrity: AsarIntegrity | null) => {
      return beforeCopyExtraFiles(packager, appOutDir, asarIntegrity, semver.lte(version || "1.8.3", "1.8.3"))
    },
  }
}

async function unpack(prepareOptions: PrepareApplicationStageDirectoryOptions, options: InternalElectronDownloadOptions, distMacOsAppName: string) {
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

  if (dist == null) {
    const zipPath = (await Promise.all<any>([
      packager.info.electronDownloader(options),
      emptyDir(out)
    ]))[0]

    if (process.platform === "darwin" || isEnvTrue(process.env.USE_UNZIP)) {
      // on mac unzip faster than 7za (1.1 sec vs 1.6 see)
      await exec("unzip", ["-oqq", "-d", out, zipPath])
    }
    else {
      await spawn(path7za, debug7zArgs("x").concat(zipPath, "-aoa", `-o${out}`))
      if (prepareOptions.platformName === "linux") {
        // https://github.com/electron-userland/electron-builder/issues/786
        // fix dir permissions — opposite to extract-zip, 7za creates dir with no-access for other users, but dir must be readable for non-root users
        await Promise.all([
          chmod(path.join(out, "locales"), "0755"),
          chmod(path.join(out, "resources"), "0755")
        ])
      }
    }
  }
  else {
    const source = packager.getElectronSrcDir(dist)
    const destination = packager.getElectronDestinationDir(out)
    log.info({source, destination}, "copying Electron")
    await emptyDir(out)
    await copyDir(source, destination, {
      isUseHardLink: DO_NOT_USE_HARD_LINKS,
    })
  }

  await cleanupAfterUnpack(prepareOptions, distMacOsAppName)
}

function cleanupAfterUnpack(prepareOptions: PrepareApplicationStageDirectoryOptions, distMacOsAppName: string) {
  const out = prepareOptions.appOutDir
  const isMac = prepareOptions.packager.platform === Platform.MAC
  const resourcesPath = isMac ? path.join(out, distMacOsAppName, "Contents", "Resources") : path.join(out, "resources")
  return Promise.all([
    unlinkIfExists(path.join(resourcesPath, "default_app.asar")),
    unlinkIfExists(path.join(out, "version")),
    isMac ? Promise.resolve() : rename(path.join(out, "LICENSE"), path.join(out, "LICENSE.electron.txt")).catch(() => {/* ignore */}),
  ])
}