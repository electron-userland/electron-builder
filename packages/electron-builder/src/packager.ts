import BluebirdPromise from "bluebird-lst"
import { Arch, Platform, Target } from "electron-builder-core"
import { CancellationToken } from "electron-builder-http/out/CancellationToken"
import { computeDefaultAppDirectory, debug, exec, isEmptyOrSpaces, Lazy, use } from "electron-builder-util"
import { deepAssign } from "electron-builder-util/out/deepAssign"
import { log, warn } from "electron-builder-util/out/log"
import { all, executeFinally } from "electron-builder-util/out/promise"
import { TmpDir } from "electron-builder-util/out/tmp"
import { EventEmitter } from "events"
import { ensureDir } from "fs-extra-p"
import * as path from "path"
import { lt as isVersionLessThan } from "semver"
import { AppInfo } from "./appInfo"
import { readAsarJson } from "./asar"
import MacPackager from "./macPackager"
import { AfterPackContext, Config, Metadata } from "./metadata"
import { ArtifactCreated, BuildInfo, PackagerOptions, SourceRepositoryInfo } from "./packagerApi"
import { PlatformPackager } from "./platformPackager"
import { getRepositoryInfo } from "./repositoryInfo"
import { computeArchToTargetNamesMap, createTargets, NoOpTarget } from "./targets/targetFactory"
import { doLoadConfig, getElectronVersion, loadConfig, readPackageJson, validateConfig } from "./util/readPackageJson"
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

  private _repositoryInfo = new Lazy<SourceRepositoryInfo>(() => getRepositoryInfo(this.projectDir, this.metadata, this.devMetadata))

  private readonly afterPackHandlers: Array<(context: AfterPackContext) => Promise<any> | null> = []

  get repositoryInfo(): Promise<SourceRepositoryInfo> {
    return this._repositoryInfo.value
  }

  readonly prepackaged?: string | null

  //noinspection JSUnusedGlobalSymbols
  constructor(readonly options: PackagerOptions, readonly cancellationToken: CancellationToken) {
    this.projectDir = options.projectDir == null ? process.cwd() : path.resolve(options.projectDir)

    this.prepackaged = options.prepackaged == null ? null : path.resolve(this.projectDir, options.prepackaged)
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
    //noinspection JSDeprecatedSymbols
    const devMetadataFromOptions = this.options.devMetadata
    if (devMetadataFromOptions != null) {
      warn("devMetadata is deprecated, please use config instead")
    }

    let configPath: string | null = null
    let configFromOptions = this.options.config
    if (typeof configFromOptions === "string") {
      // it is a path to config file
      configPath = configFromOptions
      configFromOptions = null
    }

    if (devMetadataFromOptions != null) {
      if (configFromOptions != null) {
        throw new Error("devMetadata and config cannot be used in conjunction")
      }
      configFromOptions = devMetadataFromOptions.build
    }

    const projectDir = this.projectDir
    const fileOrPackageConfig = await (configPath == null ? loadConfig(projectDir) : doLoadConfig(path.resolve(projectDir, configPath), projectDir))
    const config = deepAssign({}, fileOrPackageConfig, configFromOptions)

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

    await validateConfig(config)

    this._config = config
    this.appDir = await computeDefaultAppDirectory(projectDir, use(config.directories, it => it!.app))

    this.isTwoPackageJsonProjectLayoutUsed = this.appDir !== projectDir

    const devPackageFile = path.join(projectDir, "package.json")
    const appPackageFile = this.isTwoPackageJsonProjectLayoutUsed ? path.join(this.appDir, "package.json") : devPackageFile

    await this.readProjectMetadata(appPackageFile, extraMetadata)

    if (this.isTwoPackageJsonProjectLayoutUsed) {
      this.devMetadata = deepAssign(await readPackageJson(devPackageFile), devMetadataFromOptions)

      debug(`Two package.json structure is used (dev: ${devPackageFile}, app: ${appPackageFile})`)
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
    const outDir = path.resolve(this.projectDir, use(this.config.directories, it => it!.output) || "dist")
    return {
      outDir: outDir,
      platformToTargets: await executeFinally(this.doBuild(outDir, cleanupTasks), () => all(cleanupTasks.map(it => it()).concat(this.tempDirManager.cleanup())))
    }
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
        const data = await readAsarJson(path.join(this.projectDir, "app.asar"), "package.json")
        if (data != null) {
          this.metadata = data
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
          if (!(target instanceof NoOpTarget) && !createdOutDirs.has(target.outDir)) {
            ourDirs.add(target.outDir)
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

  private checkMetadata(appPackageFile: string, devAppPackageFile: string): void {
    const errors: Array<string> = []
    const reportError = (missedFieldName: string) => {
      errors.push(`Please specify '${missedFieldName}' in the package.json (${appPackageFile})`)
    }

    const checkNotEmpty = (name: string, value: string | n) => {
      if (isEmptyOrSpaces(value)) {
        reportError(name)
      }
    }

    const appMetadata = this.metadata

    checkNotEmpty("name", appMetadata.name)

    if (isEmptyOrSpaces(appMetadata.description)) {
      warn(`description is missed in the package.json (${appPackageFile})`)
    }
    checkNotEmpty("version", appMetadata.version)

    checkDependencies(this.devMetadata.dependencies, errors)
    if ((<any>appMetadata) !== this.devMetadata) {
      checkDependencies(appMetadata.dependencies, errors)

      if ((<any>appMetadata).build != null) {
        errors.push(`'build' in the application package.json (${appPackageFile}) is not supported since 3.0 anymore. Please move 'build' into the development package.json (${devAppPackageFile})`)
      }
    }

    const config = <any>this.config
    if (config["osx-sign"] != null) {
      errors.push("osx-sign is deprecated and not supported — please see https://github.com/electron-userland/electron-builder/wiki/Code-Signing")
    }
    if (config["osx"] != null) {
      errors.push(`osx is deprecated and not supported — please use mac instead`)
    }
    if (config["app-copyright"] != null) {
      errors.push(`app-copyright is deprecated and not supported — please use copyright instead`)
    }
    if (config["app-category-type"] != null) {
      errors.push(`app-category-type is deprecated and not supported — please use mac.category instead`)
    }

    const author = appMetadata.author
    if (author == null) {
      errors.push(`Please specify "author" in the application package.json (${appPackageFile}) — it is used as company name and copyright owner.`)
    }

    if (config.name != null) {
      errors.push(`'name' in the config is forbidden. Please move 'name' into the package.json (${appPackageFile})`)
    }

    if (config.prune != null) {
      errors.push("prune is deprecated — development dependencies are never copied in any case")
    }

    if (errors.length > 0) {
      throw new Error(errors.join("\n"))
    }
  }

  private async installAppDependencies(platform: Platform, arch: Arch): Promise<any> {
    if (this.prepackaged != null) {
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

function checkDependencies(dependencies: { [key: string]: string } | null | undefined, errors: Array<string>) {
  if (dependencies == null) {
    return
  }

  for (const name of ["electron", "electron-prebuilt", "electron-builder", "electron-rebuild"]) {
    if (name in dependencies) {
      errors.push(`Package "${name}" is only allowed in "devDependencies". `
        + `Please remove it from the "dependencies" section in your package.json.`)
    }
  }
}

export interface BuildResult {
  readonly outDir: string
  readonly platformToTargets: Map<Platform, Map<String, Target>>
}