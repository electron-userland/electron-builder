import {
  addValue,
  Arch,
  archFromString,
  AsyncTaskManager,
  DebugLogger,
  deepAssign,
  executeFinally,
  getArtifactArchName,
  InvalidConfigurationError,
  log,
  orNullIfFileNotExist,
  safeStringifyJson,
  serializeToYaml,
  TmpDir,
} from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { chmod, mkdirs, outputFile } from "fs-extra"
import * as isCI from "is-ci"
import { Lazy } from "lazy-val"
import { release as getOsRelease } from "os"
import * as path from "path"
import { AppInfo } from "./appInfo"
import { readAsarJson } from "./asar/asar"
import { AfterExtractContext, AfterPackContext, BeforePackContext, Configuration, Hook } from "./configuration"
import { Platform, SourceRepositoryInfo, Target } from "./core"
import { createElectronFrameworkSupport } from "./electron/ElectronFramework"
import { Framework } from "./Framework"
import { LibUiFramework } from "./frameworks/LibUiFramework"
import { Metadata } from "./options/metadata"
import { ArtifactBuildStarted, ArtifactCreated, PackagerOptions } from "./packagerApi"
import { PlatformPackager } from "./platformPackager"
import { ProtonFramework } from "./ProtonFramework"
import { computeArchToTargetNamesMap, createTargets, NoOpTarget } from "./targets/targetFactory"
import { computeDefaultAppDirectory, getConfig, validateConfiguration } from "./util/config/config"
import { expandMacro } from "./util/macroExpander"
import { createLazyProductionDeps, NodeModuleDirInfo, NodeModuleInfo } from "./util/packageDependencies"
import { checkMetadata, readPackageJson } from "./util/packageMetadata"
import { getRepositoryInfo } from "./util/repositoryInfo"
import { resolveFunction } from "./util/resolve"
import { installOrRebuild, nodeGypRebuild } from "./util/yarn"
import { PACKAGE_VERSION } from "./version"
import { AsyncEventEmitter, HandlerType } from "./util/asyncEventEmitter"

async function createFrameworkInfo(configuration: Configuration, packager: Packager): Promise<Framework> {
  let framework = configuration.framework
  if (framework != null) {
    framework = framework.toLowerCase()
  }

  let nodeVersion = configuration.nodeVersion
  if (framework === "electron" || framework == null) {
    return await createElectronFrameworkSupport(configuration, packager)
  }

  if (nodeVersion == null || nodeVersion === "current") {
    nodeVersion = process.versions.node
  }

  const distMacOsName = `${packager.appInfo.productFilename}.app`
  const isUseLaunchUi = configuration.launchUiVersion !== false
  if (framework === "proton" || framework === "proton-native") {
    return new ProtonFramework(nodeVersion, distMacOsName, isUseLaunchUi)
  } else if (framework === "libui") {
    return new LibUiFramework(nodeVersion, distMacOsName, isUseLaunchUi)
  } else {
    throw new InvalidConfigurationError(`Unknown framework: ${framework}`)
  }
}

type PackagerEvents = {
  artifactBuildStarted: Hook<ArtifactBuildStarted, void>

  beforePack: Hook<BeforePackContext, void>
  afterExtract: Hook<AfterExtractContext, void>
  afterPack: Hook<AfterPackContext, void>
  afterSign: Hook<AfterPackContext, void>

  artifactBuildCompleted: Hook<ArtifactCreated, void>

  msiProjectCreated: Hook<string, void>
  appxManifestCreated: Hook<string, void>

  // internal-use only, prefer usage of `artifactBuildCompleted`
  artifactCreated: Hook<ArtifactCreated, void>
}

export class Packager {
  readonly projectDir: string

  private _appDir: string
  get appDir(): string {
    return this._appDir
  }

  private _metadata: Metadata | null = null
  get metadata(): Metadata {
    return this._metadata!
  }

  private _nodeModulesHandledExternally = false

  get areNodeModulesHandledExternally(): boolean {
    return this._nodeModulesHandledExternally
  }

  private _isPrepackedAppAsar = false

  get isPrepackedAppAsar(): boolean {
    return this._isPrepackedAppAsar
  }

  private _devMetadata: Metadata | null = null
  get devMetadata(): Metadata | null {
    return this._devMetadata
  }

  private _configuration: Configuration | null = null

  get config(): Configuration {
    return this._configuration!
  }

  isTwoPackageJsonProjectLayoutUsed = false

  private readonly eventEmitter = new AsyncEventEmitter<PackagerEvents>()

  _appInfo: AppInfo | null = null
  get appInfo(): AppInfo {
    return this._appInfo!
  }

  readonly tempDirManager = new TmpDir("packager")

  private _repositoryInfo = new Lazy<SourceRepositoryInfo | null>(() => getRepositoryInfo(this.projectDir, this.metadata, this.devMetadata))

  readonly options: PackagerOptions

  readonly debugLogger = new DebugLogger(log.isDebugEnabled)

  get repositoryInfo(): Promise<SourceRepositoryInfo | null> {
    return this._repositoryInfo.value
  }

  private nodeDependencyInfo = new Map<string, Lazy<Array<any>>>()

  getNodeDependencyInfo(platform: Platform | null, flatten: boolean = true): Lazy<Array<NodeModuleInfo | NodeModuleDirInfo>> {
    let key = "" + flatten.toString()
    let excludedDependencies: Array<string> | null = null
    if (platform != null && this.framework.getExcludedDependencies != null) {
      excludedDependencies = this.framework.getExcludedDependencies(platform)
      if (excludedDependencies != null) {
        key += `-${platform.name}`
      }
    }

    let result = this.nodeDependencyInfo.get(key)
    if (result == null) {
      result = createLazyProductionDeps(this.appDir, excludedDependencies, flatten)
      this.nodeDependencyInfo.set(key, result)
    }
    return result
  }

  stageDirPathCustomizer: (target: Target, packager: PlatformPackager<any>, arch: Arch) => string = (target, packager, arch) => {
    return path.join(target.outDir, `__${target.name}-${getArtifactArchName(arch, target.name)}`)
  }

  private _buildResourcesDir: string | null = null

  get buildResourcesDir(): string {
    let result = this._buildResourcesDir
    if (result == null) {
      result = path.resolve(this.projectDir, this.relativeBuildResourcesDirname)
      this._buildResourcesDir = result
    }
    return result
  }

  get relativeBuildResourcesDirname(): string {
    return this.config.directories!.buildResources!
  }

  private _framework: Framework | null = null
  get framework(): Framework {
    return this._framework!
  }

  private readonly toDispose: Array<() => Promise<void>> = []

  disposeOnBuildFinish(disposer: () => Promise<void>) {
    this.toDispose.push(disposer)
  }

  //noinspection JSUnusedGlobalSymbols
  constructor(
    options: PackagerOptions,
    readonly cancellationToken = new CancellationToken()
  ) {
    if ("devMetadata" in options) {
      throw new InvalidConfigurationError("devMetadata in the options is deprecated, please use config instead")
    }
    if ("extraMetadata" in options) {
      throw new InvalidConfigurationError("extraMetadata in the options is deprecated, please use config.extraMetadata instead")
    }

    const targets = options.targets || new Map<Platform, Map<Arch, Array<string>>>()
    if (options.targets == null) {
      options.targets = targets
    }

    function processTargets(platform: Platform, types: Array<string>) {
      function commonArch(currentIfNotSpecified: boolean): Array<Arch> {
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
        } else {
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
      prepackaged: options.prepackaged == null ? null : path.resolve(this.projectDir, options.prepackaged),
    }

    log.info({ version: PACKAGE_VERSION, os: getOsRelease() }, "electron-builder")
  }

  async addPackagerEventHandlers() {
    const { type } = this.appInfo
    this.eventEmitter.on("artifactBuildStarted", await resolveFunction(type, this.config.artifactBuildStarted, "artifactBuildStarted"), "user")
    this.eventEmitter.on("artifactBuildCompleted", await resolveFunction(type, this.config.artifactBuildCompleted, "artifactBuildCompleted"), "user")

    this.eventEmitter.on("appxManifestCreated", await resolveFunction(type, this.config.appxManifestCreated, "appxManifestCreated"), "user")
    this.eventEmitter.on("msiProjectCreated", await resolveFunction(type, this.config.msiProjectCreated, "msiProjectCreated"), "user")

    this.eventEmitter.on("beforePack", await resolveFunction(type, this.config.beforePack, "beforePack"), "user")
    this.eventEmitter.on("afterExtract", await resolveFunction(type, this.config.afterExtract, "afterExtract"), "user")
    this.eventEmitter.on("afterPack", await resolveFunction(type, this.config.afterPack, "afterPack"), "user")
    this.eventEmitter.on("afterSign", await resolveFunction(type, this.config.afterSign, "afterSign"), "user")
  }

  onAfterPack(handler: PackagerEvents["afterPack"]): Packager {
    this.eventEmitter.on("afterPack", handler)
    return this
  }

  onArtifactCreated(handler: PackagerEvents["artifactCreated"]): Packager {
    this.eventEmitter.on("artifactCreated", handler)
    return this
  }

  filterPackagerEventListeners(event: keyof PackagerEvents, type: HandlerType | undefined) {
    return this.eventEmitter.filterListeners(event, type)
  }

  clearPackagerEventListeners() {
    this.eventEmitter.clear()
  }

  async emitArtifactBuildStarted(event: ArtifactBuildStarted, logFields?: any) {
    log.info(
      logFields || {
        target: event.targetPresentableName,
        arch: event.arch == null ? null : Arch[event.arch],
        file: log.filePath(event.file),
      },
      "building"
    )
    await this.eventEmitter.emit("artifactBuildStarted", event)
  }

  /**
   * Only for sub artifacts (update info), for main artifacts use `callArtifactBuildCompleted`.
   */
  async emitArtifactCreated(event: ArtifactCreated) {
    await this.eventEmitter.emit("artifactCreated", event)
  }

  async emitArtifactBuildCompleted(event: ArtifactCreated) {
    await this.eventEmitter.emit("artifactBuildCompleted", event)
    await this.emitArtifactCreated(event)
  }

  async emitAppxManifestCreated(path: string) {
    await this.eventEmitter.emit("appxManifestCreated", path)
  }

  async emitMsiProjectCreated(path: string) {
    await this.eventEmitter.emit("msiProjectCreated", path)
  }

  async emitBeforePack(context: BeforePackContext) {
    await this.eventEmitter.emit("beforePack", context)
  }

  async emitAfterPack(context: AfterPackContext) {
    await this.eventEmitter.emit("afterPack", context)
  }

  async emitAfterSign(context: AfterPackContext) {
    await this.eventEmitter.emit("afterSign", context)
  }

  async emitAfterExtract(context: AfterPackContext) {
    await this.eventEmitter.emit("afterExtract", context)
  }

  async validateConfig(): Promise<void> {
    let configPath: string | null = null
    let configFromOptions = this.options.config
    if (typeof configFromOptions === "string") {
      // it is a path to config file
      configPath = configFromOptions
      configFromOptions = null
    } else if (configFromOptions != null && typeof configFromOptions.extends === "string" && configFromOptions.extends.includes(".")) {
      configPath = configFromOptions.extends
      delete configFromOptions.extends
    }

    const projectDir = this.projectDir

    const devPackageFile = path.join(projectDir, "package.json")
    this._devMetadata = await orNullIfFileNotExist(readPackageJson(devPackageFile))

    const devMetadata = this.devMetadata
    const configuration = await getConfig(projectDir, configPath, configFromOptions, new Lazy(() => Promise.resolve(devMetadata)))
    if (log.isDebugEnabled) {
      log.debug({ config: getSafeEffectiveConfig(configuration) }, "effective config")
    }

    this._appDir = await computeDefaultAppDirectory(projectDir, configuration.directories!.app)
    this.isTwoPackageJsonProjectLayoutUsed = this._appDir !== projectDir

    const appPackageFile = this.isTwoPackageJsonProjectLayoutUsed ? path.join(this.appDir, "package.json") : devPackageFile

    // tslint:disable:prefer-conditional-expression
    if (this.devMetadata != null && !this.isTwoPackageJsonProjectLayoutUsed) {
      this._metadata = this.devMetadata
    } else {
      this._metadata = await this.readProjectMetadataIfTwoPackageStructureOrPrepacked(appPackageFile)
    }
    deepAssign(this.metadata, configuration.extraMetadata)

    if (this.isTwoPackageJsonProjectLayoutUsed) {
      log.debug({ devPackageFile, appPackageFile }, "two package.json structure is used")
    }
    checkMetadata(this.metadata, this.devMetadata, appPackageFile, devPackageFile)

    await validateConfiguration(configuration, this.debugLogger)

    this._configuration = configuration
    this._devMetadata = devMetadata
  }

  // external caller of this method always uses isTwoPackageJsonProjectLayoutUsed=false and appDir=projectDir, no way (and need) to use another values
  async build(repositoryInfo?: SourceRepositoryInfo): Promise<BuildResult> {
    await this.validateConfig()

    if (repositoryInfo != null) {
      this._repositoryInfo.value = Promise.resolve(repositoryInfo)
    }

    this._appInfo = new AppInfo(this, null)
    await this.addPackagerEventHandlers()

    this._framework = await createFrameworkInfo(this.config, this)

    const commonOutDirWithoutPossibleOsMacro = path.resolve(
      this.projectDir,
      expandMacro(this.config.directories!.output!, null, this._appInfo, {
        os: "",
      })
    )

    if (!isCI && (process.stdout as any).isTTY) {
      const effectiveConfigFile = path.join(commonOutDirWithoutPossibleOsMacro, "builder-effective-config.yaml")
      log.info({ file: log.filePath(effectiveConfigFile) }, "writing effective config")
      await outputFile(effectiveConfigFile, getSafeEffectiveConfig(this.config))
    }

    // because artifact event maybe dispatched several times for different publish providers
    const artifactPaths = new Set<string>()
    this.onArtifactCreated(event => {
      if (event.file != null) {
        artifactPaths.add(event.file)
      }
    })

    this.disposeOnBuildFinish(() => this.tempDirManager.cleanup())
    const platformToTargets = await executeFinally(this.doBuild(), async () => {
      if (this.debugLogger.isEnabled) {
        await this.debugLogger.save(path.join(commonOutDirWithoutPossibleOsMacro, "builder-debug.yml"))
      }

      const toDispose = this.toDispose.slice()
      this.toDispose.length = 0
      for (const disposer of toDispose) {
        await disposer().catch((e: any) => {
          log.warn({ error: e }, "cannot dispose")
        })
      }
    })

    return {
      outDir: commonOutDirWithoutPossibleOsMacro,
      artifactPaths: Array.from(artifactPaths),
      platformToTargets,
      configuration: this.config,
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

  private async doBuild(): Promise<Map<Platform, Map<string, Target>>> {
    const taskManager = new AsyncTaskManager(this.cancellationToken)
    const syncTargetsIfAny = [] as Target[]

    const platformToTarget = new Map<Platform, Map<string, Target>>()
    const createdOutDirs = new Set<string>()

    for (const [platform, archToType] of this.options.targets!) {
      if (this.cancellationToken.cancelled) {
        break
      }

      if (platform === Platform.MAC && process.platform === Platform.WINDOWS.nodeName) {
        throw new InvalidConfigurationError("Build for macOS is supported only on macOS, please see https://electron.build/multi-platform-build")
      }

      const packager = await this.createHelper(platform)
      const nameToTarget: Map<string, Target> = new Map()
      platformToTarget.set(platform, nameToTarget)

      for (const [arch, targetNames] of computeArchToTargetNamesMap(archToType, packager, platform)) {
        if (this.cancellationToken.cancelled) {
          break
        }

        // support os and arch macro in output value
        const outDir = path.resolve(this.projectDir, packager.expandMacro(this.config.directories!.output!, Arch[arch]))
        const targetList = createTargets(nameToTarget, targetNames.length === 0 ? packager.defaultTarget : targetNames, outDir, packager)
        await createOutDirIfNeed(targetList, createdOutDirs)
        await packager.pack(outDir, arch, targetList, taskManager)
      }

      if (this.cancellationToken.cancelled) {
        break
      }

      for (const target of nameToTarget.values()) {
        if (target.isAsyncSupported) {
          taskManager.addTask(target.finishBuild())
        } else {
          syncTargetsIfAny.push(target)
        }
      }
    }

    await taskManager.awaitTasks()

    for (const target of syncTargetsIfAny) {
      await target.finishBuild()
    }
    return platformToTarget
  }

  private async createHelper(platform: Platform): Promise<PlatformPackager<any>> {
    if (this.options.platformPackagerFactory != null) {
      return this.options.platformPackagerFactory(this, platform)
    }

    switch (platform) {
      case Platform.MAC: {
        const helperClass = (await import("./macPackager")).MacPackager
        return new helperClass(this)
      }

      case Platform.WINDOWS: {
        const helperClass = (await import("./winPackager")).WinPackager
        return new helperClass(this)
      }

      case Platform.LINUX:
        return new (await import("./linuxPackager")).LinuxPackager(this)

      default:
        throw new Error(`Unknown platform: ${platform}`)
    }
  }

  public async installAppDependencies(platform: Platform, arch: Arch): Promise<any> {
    if (this.options.prepackaged != null || !this.framework.isNpmRebuildRequired) {
      return
    }

    const frameworkInfo = { version: this.framework.version, useCustomDist: true }
    const config = this.config
    if (config.nodeGypRebuild === true) {
      await nodeGypRebuild(platform.nodeName, Arch[arch], frameworkInfo)
    }

    if (config.npmRebuild === false) {
      log.info({ reason: "npmRebuild is set to false" }, "skipped dependencies rebuild")
      return
    }

    const beforeBuild = await resolveFunction(this.appInfo.type, config.beforeBuild, "beforeBuild")
    if (beforeBuild != null) {
      const performDependenciesInstallOrRebuild = await beforeBuild({
        appDir: this.appDir,
        electronVersion: this.config.electronVersion!,
        platform,
        arch: Arch[arch],
      })

      // If beforeBuild resolves to false, it means that handling node_modules is done outside of electron-builder.
      this._nodeModulesHandledExternally = !performDependenciesInstallOrRebuild
      if (!performDependenciesInstallOrRebuild) {
        return
      }
    }

    if (config.buildDependenciesFromSource === true && platform.nodeName !== process.platform) {
      log.info({ reason: "platform is different and buildDependenciesFromSource is set to true" }, "skipped dependencies rebuild")
    } else {
      await installOrRebuild(config, this.appDir, {
        frameworkInfo,
        platform: platform.nodeName,
        arch: Arch[arch],
        productionDeps: this.getNodeDependencyInfo(null, false) as Lazy<Array<NodeModuleDirInfo>>,
      })
    }
  }
}

function createOutDirIfNeed(targetList: Array<Target>, createdOutDirs: Set<string>): Promise<any> {
  const ourDirs = new Set<string>()
  for (const target of targetList) {
    // noinspection SuspiciousInstanceOfGuard
    if (target instanceof NoOpTarget) {
      continue
    }

    const outDir = target.outDir
    if (!createdOutDirs.has(outDir)) {
      ourDirs.add(outDir)
    }
  }

  if (ourDirs.size === 0) {
    return Promise.resolve()
  }

  return Promise.all(
    Array.from(ourDirs)
      .sort()
      .map(dir => {
        return mkdirs(dir)
          .then(() => chmod(dir, 0o755) /* set explicitly */)
          .then(() => createdOutDirs.add(dir))
      })
  )
}

export interface BuildResult {
  readonly outDir: string
  readonly artifactPaths: Array<string>
  readonly platformToTargets: Map<Platform, Map<string, Target>>
  readonly configuration: Configuration
}

function getSafeEffectiveConfig(configuration: Configuration): string {
  const o = JSON.parse(safeStringifyJson(configuration))
  if (o.cscLink != null) {
    o.cscLink = "<hidden by builder>"
  }
  return serializeToYaml(o, true)
}
