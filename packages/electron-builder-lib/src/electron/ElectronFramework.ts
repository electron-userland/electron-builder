import { path7za } from "7zip-bin"
import BluebirdPromise from "bluebird-lst"
import { debug7zArgs, exec, isEnvTrue, log, spawn, asArray } from "builder-util"
import { copyDir, DO_NOT_USE_HARD_LINKS, statOrNull, CONCURRENCY } from "builder-util/out/fs"
import { chmod, emptyDir, readdir, remove } from "fs-extra-p"
import { Lazy } from "lazy-val"
import * as path from "path"
import { AsarIntegrity } from "../asar/integrity"
import { Configuration, ElectronDownloadOptions } from "../configuration"
import { Platform } from "../core"
import { Framework, UnpackFrameworkTaskOptions } from "../Framework"
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

async function beforeCopyExtraFiles(packager: PlatformPackager<any>, appOutDir: string, asarIntegrity: AsarIntegrity | null) {
  if (packager.platform !== Platform.MAC) {
    return
  }

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

export async function createElectronFrameworkSupport(configuration: Configuration, packager: Packager): Promise<Framework> {
  if (configuration.muonVersion != null) {
    return {
      name: "muon",
      version: configuration.muonVersion!!,
      distMacOsAppName: "Brave.app",
      unpackFramework: unpackMuon,
      isNpmRebuildRequired: true,
      beforeCopyExtraFiles,
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

  return {
    name: "electron",
    version,
    distMacOsAppName: "Electron.app",
    isNpmRebuildRequired: true,
    unpackFramework: options => unpack(options.packager, options.appOutDir, options.platformName, createDownloadOpts(options.packager.config, options.platformName, options.arch, version!!)),
    beforeCopyExtraFiles,
  }
}

/** @internal */
export function unpackMuon(options: UnpackFrameworkTaskOptions) {
  return unpack(options.packager, options.appOutDir, options.platformName, {
    mirror: "https://github.com/brave/muon/releases/download/v",
    customFilename: `brave-v${options.version}-${options.platformName}-${options.arch}.zip`,
    verifyChecksum: false,
    ...createDownloadOpts(options.packager.config, options.platformName, options.arch, options.version),
  })
}

async function unpack(packager: PlatformPackager<any>, out: string, platform: string, options: InternalElectronDownloadOptions) {
  let dist: string | null | undefined = packager.config.electronDist
  if (dist != null) {
    const zipFile = `electron-v${options.version}-${platform}-${options.arch}.zip`
    const resolvedDist = path.resolve(packager.projectDir, dist)
    if ((await statOrNull(path.join(resolvedDist, zipFile))) != null) {
      options.cache = resolvedDist
      dist = null
    }
  }

  if (dist == null) {
    const zipPath = (await BluebirdPromise.all<any>([
      packager.info.electronDownloader(options),
      emptyDir(out)
    ]))[0]

    if (process.platform === "darwin" || isEnvTrue(process.env.USE_UNZIP)) {
      // on mac unzip faster than 7za (1.1 sec vs 1.6 see)
      await exec("unzip", ["-oqq", "-d", out, zipPath])
    }
    else {
      await spawn(path7za, debug7zArgs("x").concat(zipPath, "-aoa", `-o${out}`))
      if (platform === "linux") {
        // https://github.com/electron-userland/electron-builder/issues/786
        // fix dir permissions — opposite to extract-zip, 7za creates dir with no-access for other users, but dir must be readable for non-root users
        await BluebirdPromise.all([
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
}