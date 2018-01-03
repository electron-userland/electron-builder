import BluebirdPromise from "bluebird-lst"
import { addValue, Arch, archFromString, AsyncTaskManager, DebugLogger, exec, log, safeStringifyJson, serializeToYaml, TmpDir } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { executeFinally, orNullIfFileNotExist } from "builder-util/out/promise"
import { EventEmitter } from "events"
import { ensureDir, outputFile } from "fs-extra-p"
import isCI from "is-ci"
import { dump } from "js-yaml"
import { Lazy } from "lazy-val"
import * as path from "path"
import { deepAssign } from "read-config-file/out/deepAssign"
import { AppInfo } from "./appInfo"
import { readAsarJson } from "./asar/asar"
import { AfterPackContext, Configuration } from "./configuration"
import { Platform, SourceRepositoryInfo, Target } from "./core"
import MacPackager from "./macPackager"
import { Metadata } from "./options/metadata"
import { ArtifactCreated, PackagerOptions } from "./packagerApi"
import { PlatformPackager, resolveFunction } from "./platformPackager"
import { computeArchToTargetNamesMap, createTargets, NoOpTarget } from "./targets/targetFactory"
import { computeDefaultAppDirectory, getConfig, validateConfig } from "./util/config"
import { computeElectronVersion, getElectronVersionFromInstalled } from "./util/electronVersion"
import { createLazyProductionDeps, Dependency } from "./util/packageDependencies"
import { checkMetadata, readPackageJson } from "./util/packageMetadata"
import { getRepositoryInfo } from "./util/repositoryInfo"
import { getGypEnv, installOrRebuild } from "./util/yarn"
import { WinPackager } from "./winPackager"

function addHandler(emitter: EventEmitter, event: string, handler: (...args: Array<any>) => void) {
  emitter.on(event, handler)
}

declare const PACKAGE_VERSION: string

export class Packager {
  readonly projectDir: string

  private _appDir: string
  get appDir(): string {
    return this._appDir
  }

  private _metadata: Metadata
  get metadata(): Metadata {
    return this._metadata
  }

  private _isPrepackedAppAsar: boolean

  get isPrepackedAppAsar(): boolean {
    return this._isPrepackedAppAsar
  }

  private _devMetadata: Metadata | null
  get devMetadata(): Metadata | null {
    return this._devMetadata
  }

  private _configuration: Configuration

  get config(): Configuration {
    return this._configuration
  }

  isTwoPackageJsonProjectLayoutUsed = false

  readonly eventEmitter = new EventEmitter()

  appInfo: AppInfo

  readonly tempDirManager = new TmpDir()

  private _repositoryInfo = new Lazy<SourceRepositoryInfo | null>(() => getRepositoryInfo(this.projectDir, this.metadata, this.devMetadata))

  private readonly afterPackHandlers: Array<(context: AfterPackContext) => Promise<any> | null> = []

  readonly options: PackagerOptions

  readonly debugLogger = new DebugLogger(log.isDebugEnabled)

  get repositoryInfo(): Promise<SourceRepositoryInfo | null> {
    return this._repositoryInfo.value
  }

  private _productionDeps: Lazy<Array<Dependency>> | null = null

  get productionDeps(): Lazy<Array<Dependency>> {
    let result = this._productionDeps
    if (result == null) {
      result = createLazyProductionDeps(this.appDir)
      this._productionDeps = result
    }
    return result
  }

  private _electronDownloader: any = null

  electronDownloader: (options: any) => Promise<any> = options => {
    if (this._electronDownloader == null) {
      this._electronDownloader = BluebirdPromise.promisify(require("electron-download-tf"))
    }
    return this._electronDownloader(options)
  }

  stageDirPathCustomizer: (target: Target, packager: PlatformPackager<any>, arch: Arch) => string = (target, packager, arch) => {
    return path.join(target.outDir, `__${target.name}-${Arch[arch]}`)
  }

  private _buildResourcesDir: string | null

  get buildResourcesDir(): string {
    let result = this._buildResourcesDir
    if (result == null) {
      result = path.resolve(this.projectDir, this.relativeBuildResourcesDirname)
      this._buildResourcesDir = result
    }
    return result
  }

  get relativeBuildResourcesDirname(): string {
    return this.config.directories!!.buildResources!!
  }

  //noinspection JSUnusedGlobalSymbols
  constructor(options: PackagerOptions, readonly cancellationToken = new CancellationToken()) {
    if ("project" in options) {
      throw new Error("Use projectDir instead of project")
    }

    if ("devMetadata" in options) {
      throw new Error("devMetadata in the options is deprecated, please use config instead")
    }
    if ("extraMetadata" in options) {
      throw new Error("extraMetadata in the options is deprecated, please use config.extraMetadata instead")
    }

    const targets = options.targets || new Map<Platform, Map<Arch, Array<string>>>()
    if (options.targets == null) {
      options.targets = targets
    }

    function processTargets(platform: Platform, types: Array<string>) {
      function commonArch(currentIfNotSpecified: boolean): Array<Arch> {
        if (platform === Platform.MAC) {
          return currentIfNotSpecified ? [Arch.x64] : []
        }

        const result = Array<Arch>()
        return result.length === 0 && currentIfNotSpecified ? [archFromString(process.arch)] : result
      }

      let archToType = targets.get(platform)
      if (archToType == null) {
        archToType = new Map<Arch, Array<string>>()
        targets.set(platform, archToType)
      }

      if (types.length === 0) {
        for (const arch of commonArch(false)) {
          archToType.set(arch, [])
        }
        return
      }

      for (const type of types) {
        const suffixPos = type.lastIndexOf(":")
        if (suffixPos > 0) {
          addValue(archToType, archFromString(type.substring(suffixPos + 1)), type.substring(0, suffixPos))
        }
        else {
          for (const arch of commonArch(true)) {
            addValue(archToType, arch, type)
          }
        }
      }
    }

    if (options.mac != null) {
      processTargets(Platform.MAC, options.mac)
    }
    if (options.linux != null) {
      processTargets(Platform.LINUX, options.linux)
    }
    if (options.win != null) {
      processTargets(Platform.WINDOWS, options.win)
    }

    this.projectDir = options.projectDir == null ? process.cwd() : path.resolve(options.projectDir)
    this._appDir = this.projectDir
    this.options = {
      ...options,
      prepackaged: options.prepackaged == null ? null : path.resolve(this.projectDir, options.prepackaged)
    }

    try {
      log.info({version: PACKAGE_VERSION}, "electron-builder")
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
    this._devMetadata = await orNullIfFileNotExist(readPackageJson(devPackageFile))

    const devMetadata = this.devMetadata
    const configuration = await getConfig(projectDir, configPath, configFromOptions, new Lazy(() => BluebirdPromise.resolve(devMetadata)))
    if (log.isDebugEnabled) {
      log.debug({config: serializeToYaml(JSON.parse(safeStringifyJson(configuration)))}, "effective config")
    }

    this._appDir = await computeDefaultAppDirectory(projectDir, configuration.directories!!.app)
    this.isTwoPackageJsonProjectLayoutUsed = this._appDir !== projectDir

    const appPackageFile = this.isTwoPackageJsonProjectLayoutUsed ? path.join(this.appDir, "package.json") : devPackageFile

    // tslint:disable:prefer-conditional-expression
    if (this.devMetadata != null && !this.isTwoPackageJsonProjectLayoutUsed) {
      this._metadata = this.devMetadata
    }
    else {
      this._metadata = await this.readProjectMetadataIfTwoPackageStructureOrPrepacked(appPackageFile)
    }
    deepAssign(this.metadata, configuration.extraMetadata)

    if (this.isTwoPackageJsonProjectLayoutUsed) {
      log.debug({devPackageFile, appPackageFile}, "two package.json structure is used")
    }
    checkMetadata(this.metadata, this.devMetadata, appPackageFile, devPackageFile)

    return await this._build(configuration, this._metadata, this._devMetadata)
  }

  // external caller of this method always uses isTwoPackageJsonProjectLayoutUsed=false and appDir=projectDir, no way (and need) to use another values
  async _build(configuration: Configuration, metadata: Metadata, devMetadata: Metadata | null, repositoryInfo?: SourceRepositoryInfo): Promise<BuildResult> {
    await validateConfig(configuration, this.debugLogger)
    this._configuration = configuration
    this._metadata = metadata
    this._devMetadata = devMetadata

    if (repositoryInfo != null) {
      this._repositoryInfo.value = BluebirdPromise.resolve(repositoryInfo)
    }

    const projectDir = this.projectDir
    if (configuration.electronVersion == null) {
      // for prepacked app asar no dev deps in the app.asar
      if (this.isPrepackedAppAsar) {
        configuration.electronVersion = await getElectronVersionFromInstalled(projectDir)
        if (configuration.electronVersion == null) {
          throw new Error(`Cannot compute electron version for prepacked asar`)
        }
      }
      configuration.electronVersion = await computeElectronVersion(projectDir, new Lazy(() => BluebirdPromise.resolve(this.metadata)))
    }
    this.appInfo = new AppInfo(this)

    const outDir = path.resolve(this.projectDir, configuration.directories!!.output)

    if (!isCI && (process.stdout as any).isTTY) {
      const effectiveConfigFile = path.join(outDir, "electron-builder.yaml")
      log.info({file: log.filePath(effectiveConfigFile)}, "writing effective config")
      // dump instead of safeDump to dump functions
      await outputFile(effectiveConfigFile, dump(configuration))
    }

    return {
      outDir,
      platformToTargets: await executeFinally(this.doBuild(outDir), async () => {
        if (this.debugLogger.enabled) {
          await this.debugLogger.save(path.join(outDir, "electron-builder-debug.yml"))
        }
        await this.tempDirManager.cleanup()
      }),
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

  private async doBuild(outDir: string): Promise<Map<Platform, Map<string, Target>>> {
    const taskManager = new AsyncTaskManager(this.cancellationToken)

    const platformToTarget = new Map<Platform, Map<string, Target>>()
    const createdOutDirs = new Set<string>()

    for (const [platform, archToType] of this.options.targets!) {
      if (this.cancellationToken.cancelled) {
        break
      }

      if (platform === Platform.MAC && process.platform === Platform.WINDOWS.nodeName) {
        throw new Error("Build for macOS is supported only on macOS, please see https://electron.build/multi-platform-build")
      }

      const packager = this.createHelper(platform)
      const nameToTarget: Map<string, Target> = new Map()
      platformToTarget.set(platform, nameToTarget)

      for (const [arch, targetNames] of computeArchToTargetNamesMap(archToType, packager.platformSpecificBuildOptions, platform)) {
        if (this.cancellationToken.cancelled) {
          break
        }

        await this.installAppDependencies(platform, arch)

        if (this.cancellationToken.cancelled) {
          break
        }

        const targetList = createTargets(nameToTarget, targetNames.length === 0 ? packager.defaultTarget : targetNames, outDir, packager)
        await createOutDirIfNeed(targetList, createdOutDirs)
        await packager.pack(outDir, arch, targetList, taskManager)
      }

      if (this.cancellationToken.cancelled) {
        break
      }

      for (const target of nameToTarget.values()) {
        taskManager.addTask(target.finishBuild())
      }
    }

    await taskManager.awaitTasks()
    return platformToTarget
  }

  private createHelper(platform: Platform): PlatformPackager<any> {
    if (this.options.platformPackagerFactory != null) {
      return this.options.platformPackagerFactory!(this, platform)
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
    if (this.options.prepackaged != null) {
      return
    }

    const frameworkInfo = {version: this.config.muonVersion || this.config.electronVersion!, useCustomDist: this.config.muonVersion == null}
    const config = this.config
    if (config.nodeGypRebuild === true) {
      log.info({arch: Arch[arch]}, "executing node-gyp rebuild")
      await exec(process.platform === "win32" ? "node-gyp.cmd" : "node-gyp", ["rebuild"], {
        env: getGypEnv(frameworkInfo, platform.nodeName, Arch[arch], true),
      })
    }

    if (config.npmRebuild === false) {
      log.info({reason: "npmRebuild is set to false"}, "skipped app dependencies rebuild")
      return
    }

    const beforeBuild = resolveFunction(config.beforeBuild)
    if (beforeBuild != null) {
      const performDependenciesInstallOrRebuild = await beforeBuild({
        appDir: this.appDir,
        electronVersion: this.config.electronVersion!,
        platform,
        arch: Arch[arch]
      })
      if (!performDependenciesInstallOrRebuild) {
        return
      }
    }

    if (config.buildDependenciesFromSource === true && platform.nodeName !== process.platform) {
      log.info({reason: "platform is different and buildDependenciesFromSource is set to true"}, "skipped app dependencies rebuild")
    }
    else {
      await installOrRebuild(config, this.appDir, {
        frameworkInfo,
        platform: platform.nodeName,
        arch: Arch[arch],
        productionDeps: this.productionDeps,
      })
    }
  }

  afterPack(context: AfterPackContext): Promise<any> {
    const afterPack = resolveFunction(this.config.afterPack)
    const handlers = this.afterPackHandlers.slice()
    if (afterPack != null) {
      // user handler should be last
      handlers.push(afterPack)
    }
    return BluebirdPromise.each(handlers, it => it(context))
  }
}

function createOutDirIfNeed(targetList: Array<Target>, createdOutDirs: Set<string>): Promise<any> {
  const ourDirs = new Set<string>()
  for (const target of targetList) {
    // noinspection SuspiciousInstanceOfGuard
    if (target instanceof NoOpTarget) {
      continue
    }

    const outDir = (target as Target).outDir
    if (!createdOutDirs.has(outDir)) {
      ourDirs.add(outDir)
    }
  }

  if (ourDirs.size > 0) {
    return BluebirdPromise.map(Array.from(ourDirs).sort(), it => {
      createdOutDirs.add(it)
      return ensureDir(it)
    })
  }
  return BluebirdPromise.resolve()
}

export interface BuildResult {
  readonly outDir: string
  readonly platformToTargets: Map<Platform, Map<string, Target>>
}