import { extractFile } from "asar-electron-builder"
import BluebirdPromise from "bluebird-lst-c"
import { Arch, Platform, Target } from "electron-builder-core"
import { computeDefaultAppDirectory, exec, isEmptyOrSpaces, use } from "electron-builder-util"
import { deepAssign } from "electron-builder-util/out/deepAssign"
import { log, warn } from "electron-builder-util/out/log"
import { all, executeFinally } from "electron-builder-util/out/promise"
import { TmpDir } from "electron-builder-util/out/tmp"
import { EventEmitter } from "events"
import * as path from "path"
import { lt as isVersionLessThan } from "semver"
import * as util from "util"
import { AppInfo } from "./appInfo"
import * as errorMessages from "./errorMessages"
import MacPackager from "./macPackager"
import { AfterPackContext, Config, Metadata } from "./metadata"
import { ArtifactCreated, BuildInfo, PackagerOptions, SourceRepositoryInfo } from "./packagerApi"
import { PlatformPackager } from "./platformPackager"
import { getRepositoryInfo } from "./repositoryInfo"
import { createTargets } from "./targets/targetFactory"
import { getElectronVersion, loadConfig, readPackageJson } from "./util/readPackageJson"
import { WinPackager } from "./winPackager"
import { getGypEnv, installOrRebuild } from "./yarn"

function addHandler(emitter: EventEmitter, event: string, handler: Function) {
  emitter.on(event, handler)
}

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

  readonly eventEmitter = new EventEmitter()

  appInfo: AppInfo

  readonly tempDirManager = new TmpDir()

  private _repositoryInfo: Promise<SourceRepositoryInfo> | null

  private readonly afterPackHandlers: Array<(context: AfterPackContext) => Promise<any> | null> = []

  get repositoryInfo(): Promise<SourceRepositoryInfo> {
    if (this._repositoryInfo == null) {
      this._repositoryInfo = getRepositoryInfo(this.appInfo.metadata, this.devMetadata)
    }
    return this._repositoryInfo
  }

  //noinspection JSUnusedGlobalSymbols
  constructor(public options: PackagerOptions) {
    this.projectDir = options.projectDir == null ? process.cwd() : path.resolve(options.projectDir)
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

  async build(): Promise<Map<Platform, Map<String, Target>>> {
    //noinspection JSDeprecatedSymbols
    const devMetadataFromOptions = this.options.devMetadata
    if (devMetadataFromOptions != null) {
      warn("devMetadata is deprecated, please use config instead")
    }

    let configFromOptions = this.options.config
    if (devMetadataFromOptions != null) {
      if (configFromOptions != null) {
        throw new Error("devMetadata and config cannot be used in conjunction")
      }
      configFromOptions = devMetadataFromOptions.build
    }

    const projectDir = this.projectDir
    const fileOrPackageConfig = await loadConfig(projectDir)
    const config = fileOrPackageConfig == null ? configFromOptions : deepAssign(fileOrPackageConfig, configFromOptions)

    const extraMetadata = this.options.extraMetadata
    if (extraMetadata != null) {
      const extraBuildMetadata = extraMetadata.build
      if (extraBuildMetadata != null) {
        deepAssign(config, extraBuildMetadata)
        delete extraMetadata.build
      }
      if (extraMetadata.directories != null) {
        warn(`--em.directories is deprecated, please specify as --em.build.directories"`)
        deepAssign(config, {directories: extraMetadata.directories})
        delete extraMetadata.directories
      }
    }

    this._config = config
    this.appDir = await computeDefaultAppDirectory(projectDir, use(config.directories, it => it!.app))

    this.isTwoPackageJsonProjectLayoutUsed = this.appDir !== projectDir

    const devPackageFile = path.join(projectDir, "package.json")
    const appPackageFile = this.isTwoPackageJsonProjectLayoutUsed ? path.join(this.appDir, "package.json") : devPackageFile

    await this.readProjectMetadata(appPackageFile, extraMetadata)

    if (this.isTwoPackageJsonProjectLayoutUsed) {
      this.devMetadata = deepAssign(await readPackageJson(devPackageFile), devMetadataFromOptions)
    }
    else {
      this.devMetadata = this.metadata
      if (this.options.appMetadata != null) {
        deepAssign(this.devMetadata, this.options.appMetadata)
      }
      if (extraMetadata != null) {
        deepAssign(this.devMetadata, extraMetadata)
      }
    }

    this.checkMetadata(appPackageFile, devPackageFile)
    checkConflictingOptions(this.config)

    this.electronVersion = await getElectronVersion(this.config, projectDir, this.isPrepackedAppAsar ? this.metadata : null)

    this.appInfo = new AppInfo(this.metadata, this)
    const cleanupTasks: Array<() => Promise<any>> = []
    return await executeFinally(this.doBuild(cleanupTasks), () => all(cleanupTasks.map(it => it()).concat(this.tempDirManager.cleanup())))
  }

  private async readProjectMetadata(appPackageFile: string, extraMetadata: any) {
    try {
      this.metadata = deepAssign(await readPackageJson(appPackageFile), this.options.appMetadata, extraMetadata)
    }
    catch (e) {
      if (e.code !== "ENOENT") {
        throw e
      }

      try {
        const file = extractFile(path.join(this.projectDir, "app.asar"), "package.json")
        if (file != null) {
          this.metadata = JSON.parse(file.toString())
          this._isPrepackedAppAsar = true
          return
        }
      }
      catch (e) {
        if (e.code !== "ENOENT") {
          throw e
        }
      }

      throw new Error(`Cannot find package.json in the ${path.dirname(appPackageFile)}`)
    }
  }

  private async doBuild(cleanupTasks: Array<() => Promise<any>>): Promise<Map<Platform, Map<String, Target>>> {
    const distTasks: Array<Promise<any>> = []
    const outDir = path.resolve(this.projectDir, use(this.config.directories, it => it!.output) || "dist")

    const platformToTarget: Map<Platform, Map<String, Target>> = new Map()
    // custom packager - don't check wine
    let checkWine = this.options.prepackaged == null && this.options.platformPackagerFactory == null
    for (const [platform, archToType] of this.options.targets!) {
      if (platform === Platform.MAC && process.platform === Platform.WINDOWS.nodeName) {
        throw new Error("Build for macOS is supported only on macOS, please see https://github.com/electron-userland/electron-builder/wiki/Multi-Platform-Build")
      }

      let wineCheck: Promise<string> | null = null
      if (checkWine && process.platform !== "win32" && platform === Platform.WINDOWS) {
        wineCheck = exec("wine", ["--version"])
      }

      const helper = this.createHelper(platform, cleanupTasks)
      const nameToTarget: Map<String, Target> = new Map()
      platformToTarget.set(platform, nameToTarget)

      for (const [arch, targets] of archToType) {
        await this.installAppDependencies(platform, arch)

        if (checkWine && wineCheck != null) {
          checkWine = false
          await checkWineVersion(wineCheck)
        }

        await helper.pack(outDir, arch, createTargets(nameToTarget, targets, outDir, helper, cleanupTasks), distTasks)
      }

      for (const target of nameToTarget.values()) {
        distTasks.push(target.finishBuild())
      }
    }

    await BluebirdPromise.all(distTasks)
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

  private checkMetadata(appPackageFile: string, devAppPackageFile: string): void {
    const reportError = (missedFieldName: string) => {
      throw new Error(`Please specify '${missedFieldName}' in the application package.json ('${appPackageFile}')`)
    }

    const checkNotEmpty = (name: string, value: string | n) => {
      if (isEmptyOrSpaces(value)) {
        reportError(name)
      }
    }

    const appMetadata = this.metadata

    checkNotEmpty("name", appMetadata.name)
    checkNotEmpty("description", appMetadata.description)
    checkNotEmpty("version", appMetadata.version)

    checkDependencies(this.devMetadata.dependencies)
    if ((<any>appMetadata) !== this.devMetadata) {
      checkDependencies(appMetadata.dependencies)

      if ((<any>appMetadata).build != null) {
        throw new Error(util.format(errorMessages.buildInAppSpecified, appPackageFile, devAppPackageFile))
      }
    }

    const build = <any>this.config
    if (build == null) {
      throw new Error(util.format(errorMessages.buildIsMissed, devAppPackageFile))
    }
    else {
      if (build["osx-sign"] != null) {
        throw new Error("osx-sign is deprecated and not supported — please see https://github.com/electron-userland/electron-builder/wiki/Code-Signing")
      }
      if (build["osx"] != null) {
        throw new Error(`build.osx is deprecated and not supported — please use build.mac instead`)
      }
      if (build["app-copyright"] != null) {
        throw new Error(`build.app-copyright is deprecated and not supported — please use build.copyright instead`)
      }
      if (build["app-category-type"] != null) {
        throw new Error(`build.app-category-type is deprecated and not supported — please use build.mac.category instead`)
      }

      const author = appMetadata.author
      if (author == null) {
        throw new Error(`Please specify "author" in the application package.json ('${appPackageFile}') — it is used as company name.`)
      }

      if (build.name != null) {
        throw new Error(util.format(errorMessages.nameInBuildSpecified, appPackageFile))
      }

      if (build.prune != null) {
        warn("prune is deprecated — development dependencies are never copied in any case")
      }
    }
  }

  private async installAppDependencies(platform: Platform, arch: Arch): Promise<any> {
    if (this.options.prepackaged != null) {
      return
    }

    const options = this.config
    if (options.nodeGypRebuild === true) {
      log(`Executing node-gyp rebuild for arch ${Arch[arch]}`)
      await exec(process.platform === "win32" ? "node-gyp.cmd" : "node-gyp", ["rebuild"], {
        env: getGypEnv(this.electronVersion, platform.nodeName, Arch[arch], true),
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
      await installOrRebuild(options, this.appDir, this.electronVersion, platform.nodeName, Arch[arch])
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

function checkConflictingOptions(options: any) {
  for (const name of ["all", "out", "tmpdir", "version", "platform", "dir", "arch", "name", "extra-resource"]) {
    if (name in options) {
      throw new Error(`Option ${name} is ignored, do not specify it.`)
    }
  }
}

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

function checkDependencies(dependencies?: { [key: string]: string }) {
  if (dependencies == null) {
    return
  }

  for (const name of ["electron", "electron-prebuilt", "electron-builder"]) {
    if (name in dependencies) {
      throw new Error(`Package "${name}" is only allowed in "devDependencies". `
        + `Please remove it from the "dependencies" section in your package.json.`)
    }
  }
}