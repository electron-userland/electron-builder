import BluebirdPromise from "bluebird-lst"
import { CancellationToken } from "electron-builder-http"
import { computeDefaultAppDirectory, debug, exec, Lazy, safeStringifyJson, use } from "electron-builder-util"
import { deepAssign } from "electron-builder-util/out/deepAssign"
import { log } from "electron-builder-util/out/log"
import { all, executeFinally, orNullIfFileNotExist } from "electron-builder-util/out/promise"
import { TmpDir } from "electron-builder-util/out/tmp"
import { EventEmitter } from "events"
import { ensureDir } from "fs-extra-p"
import * as path from "path"
import { lt as isVersionLessThan } from "semver"
import { AppInfo } from "./appInfo"
import { readAsarJson } from "./asar"
import { Arch, Platform, SourceRepositoryInfo, Target } from "./core"
import MacPackager from "./macPackager"
import { AfterPackContext, Config, Metadata } from "./metadata"
import { ArtifactCreated, BuildInfo, PackagerOptions } from "./packagerApi"
import { PlatformPackager } from "./platformPackager"
import { computeArchToTargetNamesMap, createTargets, NoOpTarget } from "./targets/targetFactory"
import { computeFinalConfig, getElectronVersion, validateConfig } from "./util/config"
import { checkMetadata, readPackageJson } from "./util/packageMetadata"
import { getRepositoryInfo } from "./util/repositoryInfo"
import { getGypEnv, installOrRebuild } from "./util/yarn"
import { WinPackager } from "./winPackager"

function addHandler(emitter: EventEmitter, event: string, handler: Function) {
  emitter.on(event, handler)
}

declare const PACKAGE_VERSION: string

export class Packager implements BuildInfo {
  readonly projectDir: string
  appDir: string

  metadata: Metadata

  private _isPrepackedAppAsar: boolean

  get isPrepackedAppAsar(): boolean {
    return this._isPrepackedAppAsar
  }

  private devMetadata: Metadata

  private _config: Config

  get config(): Config {
    return this._config
  }

  isTwoPackageJsonProjectLayoutUsed = true

  electronVersion: string
  muonVersion?: string | null

  readonly eventEmitter = new EventEmitter()

  appInfo: AppInfo

  readonly tempDirManager = new TmpDir()

  private _repositoryInfo = new Lazy<SourceRepositoryInfo | null>(() => getRepositoryInfo(this.projectDir, this.metadata, this.devMetadata))

  private readonly afterPackHandlers: Array<(context: AfterPackContext) => Promise<any> | null> = []

  get repositoryInfo(): Promise<SourceRepositoryInfo | null> {
    return this._repositoryInfo.value
  }

  readonly prepackaged?: string | null

  //noinspection JSUnusedGlobalSymbols
  constructor(readonly options: PackagerOptions, readonly cancellationToken: CancellationToken) {
    if ("devMetadata" in options) {
      throw new Error("devMetadata in the options is deprecated, please use config instead")
    }
    if ("extraMetadata" in options) {
      throw new Error("extraMetadata in the options is deprecated, please use config.extraMetadata instead")
    }

    this.projectDir = options.projectDir == null ? process.cwd() : path.resolve(options.projectDir)

    this.prepackaged = options.prepackaged == null ? null : path.resolve(this.projectDir, options.prepackaged)

    try {
      log("electron-builder " + PACKAGE_VERSION)
    }
    catch (e) {
      // error in dev mode without babel
      if (!(e instanceof ReferenceError)) {
        throw e
      }
    }
  }

  addAfterPackHandler(handler: (context: AfterPackContext) => Promise<any> | null) {
    this.afterPackHandlers.push(handler)
  }

  artifactCreated(handler: (event: ArtifactCreated) => void): Packager {
    addHandler(this.eventEmitter, "artifactCreated", handler)
    return this
  }

  dispatchArtifactCreated(event: ArtifactCreated) {
    this.eventEmitter.emit("artifactCreated", event)
  }

  async build(): Promise<BuildResult> {
    let configPath: string | null = null
    let configFromOptions = this.options.config
    if (typeof configFromOptions === "string") {
      // it is a path to config file
      configPath = configFromOptions
      configFromOptions = null
    }
    else if (configFromOptions != null && configFromOptions.extends != null && configFromOptions.extends.includes(".")) {
      configPath = configFromOptions.extends
    }

    const projectDir = this.projectDir

    const devPackageFile = path.join(projectDir, "package.json")
    this.devMetadata = await orNullIfFileNotExist(readPackageJson(devPackageFile))

    const devMetadata = this.devMetadata
    const config = await computeFinalConfig(projectDir, configPath, devMetadata, configFromOptions)
    if (debug.enabled) {
      debug(`Effective config: ${safeStringifyJson(config)}`)
    }
    await validateConfig(config)
    this._config = config

    this.appDir = await computeDefaultAppDirectory(projectDir, use(config.directories, it => it!.app))

    this.isTwoPackageJsonProjectLayoutUsed = this.appDir !== projectDir

    const appPackageFile = this.isTwoPackageJsonProjectLayoutUsed ? path.join(this.appDir, "package.json") : devPackageFile

    const extraMetadata = config.extraMetadata
    if (devMetadata != null && !this.isTwoPackageJsonProjectLayoutUsed) {
      this.metadata = devMetadata
    }
    else {
      this.metadata = await this.readProjectMetadataIfTwoPackageStructureOrPrepacked(appPackageFile)
    }
    deepAssign(this.metadata, extraMetadata)

    if (this.isTwoPackageJsonProjectLayoutUsed) {
      debug(`Two package.json structure is used (dev: ${devPackageFile}, app: ${appPackageFile})`)
    }

    checkMetadata(this.metadata, devMetadata, appPackageFile, devPackageFile)

    this.electronVersion = await getElectronVersion(config, projectDir, this.isPrepackedAppAsar ? this.metadata : null)
    this.muonVersion = config.muonVersion
    this.appInfo = new AppInfo(this.metadata, this)

    const cleanupTasks: Array<() => Promise<any>> = []
    const outDir = path.resolve(this.projectDir, use(config.directories, it => it!.output) || "dist")
    return {
      outDir: outDir,
      platformToTargets: await executeFinally(this.doBuild(outDir, cleanupTasks), () => all(cleanupTasks.map(it => it()).concat(this.tempDirManager.cleanup())))
    }
  }

  private async readProjectMetadataIfTwoPackageStructureOrPrepacked(appPackageFile: string): Promise<Metadata> {
    let data = await orNullIfFileNotExist(readPackageJson(appPackageFile))
    if (data != null) {
      return data
    }

    data = await orNullIfFileNotExist(readAsarJson(path.join(this.projectDir, "app.asar"), "package.json"))
    if (data != null) {
      this._isPrepackedAppAsar = true
      return data
    }

    throw new Error(`Cannot find package.json in the ${path.dirname(appPackageFile)}`)
  }

  private async doBuild(outDir: string, cleanupTasks: Array<() => Promise<any>>): Promise<Map<Platform, Map<String, Target>>> {
    const distTasks: Array<Promise<any>> = []
    const platformToTarget = new Map<Platform, Map<String, Target>>()
    const createdOutDirs = new Set<string>()

    // custom packager - don't check wine
    let checkWine = this.prepackaged == null && this.options.platformPackagerFactory == null
    for (const [platform, archToType] of this.options.targets!) {
      if (this.cancellationToken.cancelled) {
        break
      }

      if (platform === Platform.MAC && process.platform === Platform.WINDOWS.nodeName) {
        throw new Error("Build for macOS is supported only on macOS, please see https://github.com/electron-userland/electron-builder/wiki/Multi-Platform-Build")
      }

      let wineCheck: Promise<string> | null = null
      if (checkWine && process.platform !== "win32" && platform === Platform.WINDOWS) {
        wineCheck = exec("wine", ["--version"])
      }

      const packager = this.createHelper(platform, cleanupTasks)
      const nameToTarget: Map<String, Target> = new Map()
      platformToTarget.set(platform, nameToTarget)

      for (const [arch, targetNames] of computeArchToTargetNamesMap(archToType, packager.platformSpecificBuildOptions, platform)) {
        if (this.cancellationToken.cancelled) {
          break
        }

        await this.installAppDependencies(platform, arch)

        if (this.cancellationToken.cancelled) {
          break
        }

        if (checkWine && wineCheck != null) {
          checkWine = false
          await checkWineVersion(wineCheck)
        }

        const targetList = createTargets(nameToTarget, targetNames.length === 0 ? packager.defaultTarget : targetNames, outDir, packager, cleanupTasks)
        const ourDirs = new Set<string>()
        for (const target of targetList) {
          if (target instanceof NoOpTarget) {
            continue
          }

          const outDir = (<Target>target).outDir
          if (createdOutDirs.has(outDir)) {
            ourDirs.add(outDir)
          }
        }

        if (ourDirs.size > 0) {
          await BluebirdPromise.map(Array.from(ourDirs).sort(), it => {
            createdOutDirs.add(it)
            return ensureDir(it)
          })
        }

        await packager.pack(outDir, arch, targetList, distTasks)
      }

      if (this.cancellationToken.cancelled) {
        break
      }

      for (const target of nameToTarget.values()) {
        distTasks.push(target.finishBuild())
      }
    }

    if (this.cancellationToken.cancelled) {
      for (const task of distTasks) {
        if ("cancel" in task) {
          (<BluebirdPromise<any>>task).cancel()
        }
      }
    }
    else {
      await BluebirdPromise.all(distTasks)
    }
    return platformToTarget
  }

  private createHelper(platform: Platform, cleanupTasks: Array<() => Promise<any>>): PlatformPackager<any> {
    if (this.options.platformPackagerFactory != null) {
      return this.options.platformPackagerFactory!(this,  platform, cleanupTasks)
    }

    switch (platform) {
      case Platform.MAC:
      {
        const helperClass: typeof MacPackager = require("./macPackager").default
        return new helperClass(this)
      }

      case Platform.WINDOWS:
      {
        const helperClass: typeof WinPackager = require("./winPackager").WinPackager
        return new helperClass(this)
      }

      case Platform.LINUX:
        return new (require("./linuxPackager").LinuxPackager)(this)

      default:
        throw new Error(`Unknown platform: ${platform}`)
    }
  }

  private async installAppDependencies(platform: Platform, arch: Arch): Promise<any> {
    if (this.prepackaged != null) {
      return
    }

    const frameworkInfo = {version: this.muonVersion || this.electronVersion, useCustomDist: this.muonVersion == null}
    const options = this.config
    if (options.nodeGypRebuild === true) {
      log(`Executing node-gyp rebuild for arch ${Arch[arch]}`)
      await exec(process.platform === "win32" ? "node-gyp.cmd" : "node-gyp", ["rebuild"], {
        env: getGypEnv(frameworkInfo, platform.nodeName, Arch[arch], true),
      })
    }

    if (options.npmRebuild === false) {
      log("Skip app dependencies rebuild because npmRebuild is set to false")
      return
    }

    const beforeBuild = options.beforeBuild
    if (beforeBuild != null) {
      const performDependenciesInstallOrRebuild = await beforeBuild({
        appDir: this.appDir,
        electronVersion: this.electronVersion,
        platform,
        arch: Arch[arch]
      })
      if (!performDependenciesInstallOrRebuild) return
    }

    if (options.npmSkipBuildFromSource !== true && platform.nodeName !== process.platform) {
      log("Skip app dependencies rebuild because platform is different")
    }
    else {
      await installOrRebuild(options, this.appDir, frameworkInfo, platform.nodeName, Arch[arch])
    }
  }

  afterPack(context: AfterPackContext): Promise<void> {
    const afterPack = this.config.afterPack
    const handlers = this.afterPackHandlers.slice()
    if (afterPack != null) {
      // user handler should be last
      handlers.push(afterPack)
    }
    return BluebirdPromise.each(handlers, it => it(context))
  }
}

export function normalizePlatforms(rawPlatforms: Array<string | Platform> | string | Platform | n): Array<Platform> {
  const platforms = rawPlatforms == null || Array.isArray(rawPlatforms) ? (<Array<string | Platform | n>>rawPlatforms) : [rawPlatforms]
  if (<any>platforms == null || platforms.length === 0) {
    return [Platform.fromString(process.platform)]
  }
  else if (platforms[0] === "all") {
    if (process.platform === Platform.MAC.nodeName) {
      return [Platform.MAC, Platform.LINUX, Platform.WINDOWS]
    }
    else if (process.platform === Platform.LINUX.nodeName) {
      // macOS code sign works only on macOS
      return [Platform.LINUX, Platform.WINDOWS]
    }
    else {
      return [Platform.WINDOWS]
    }
  }
  else {
    return platforms.map(it => it instanceof Platform ? it : Platform.fromString(it!))
  }
}

/**
 * @private
 */
export async function checkWineVersion(checkPromise: Promise<string>) {
  function wineError(prefix: string): string {
    return `${prefix}, please see https://github.com/electron-userland/electron-builder/wiki/Multi-Platform-Build#${(process.platform === "linux" ? "linux" : "macos")}`
  }

  let wineVersion: string
  try {
    wineVersion = (await checkPromise).trim()
  }
  catch (e) {
    if (e.code === "ENOENT") {
      throw new Error(wineError("wine is required"))
    }
    else {
      throw new Error(`Cannot check wine version: ${e}`)
    }
  }

  if (wineVersion.startsWith("wine-")) {
    wineVersion = wineVersion.substring("wine-".length)
  }

  const spaceIndex = wineVersion.indexOf(" ")
  if (spaceIndex > 0) {
    wineVersion = wineVersion.substring(0, spaceIndex)
  }

  const suffixIndex = wineVersion.indexOf("-")
  if (suffixIndex > 0) {
    wineVersion = wineVersion.substring(0, suffixIndex)
  }

  if (wineVersion.split(".").length === 2) {
    wineVersion += ".0"
  }

  if (isVersionLessThan(wineVersion, "1.8.0")) {
    throw new Error(wineError(`wine 1.8+ is required, but your version is ${wineVersion}`))
  }
}

export interface BuildResult {
  readonly outDir: string
  readonly platformToTargets: Map<Platform, Map<String, Target>>
}