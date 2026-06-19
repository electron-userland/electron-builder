import {
  addValue,
  Arch,
  archFromString,
  AsyncTaskManager,
  DebugLogger,
  executeFinally,
  getArtifactArchName,
  InvalidConfigurationError,
  log,
  MAX_FILE_REQUESTS,
  orNullIfFileNotExist,
  sanitizeDirPath,
  safeStringifyJson,
  serializeToYaml,
  TmpDir,
} from "builder-util"
import { CancellationToken, deepAssign, retry } from "builder-util-runtime"

import { isCI } from "ci-info"
import { Lazy } from "lazy-val"
import { release as getOsRelease } from "os"
import * as path from "path"
import { AppInfo } from "./appInfo.js"
import { readAsarJson } from "./asar/asar.js"
import { AfterExtractContext, AfterPackContext, BeforePackContext, Configuration, Hook } from "./configuration.js"
import { Platform, SourceRepositoryInfo, Target } from "./core.js"
import { createElectronFrameworkSupport } from "./electron/ElectronFramework.js"
import { Framework } from "./Framework.js"
import { Metadata } from "./options/metadata.js"
import { ArtifactBuildStarted, ArtifactCreated, PackagerOptions } from "./packagerApi.js"
import { PlatformPackager } from "./platformPackager.js"
import { computeArchToTargetNamesMap, createTargets, NoOpTarget } from "./targets/targetFactory.js"
import { computeDefaultAppDirectory, getConfig, validateConfiguration } from "./util/config/config.js"
import { expandMacro } from "./util/macroExpander.js"
import { checkMetadata, readPackageJson } from "./util/packageMetadata.js"
import { getRepositoryInfo } from "./util/repositoryInfo.js"
import { resolveFunction } from "./util/resolve.js"
import { installOrRebuild, nodeGypRebuild } from "./util/installOrRebuild.js"
import { PACKAGE_VERSION } from "./version.js"
import { AsyncEventEmitter, HandlerType } from "./util/asyncEventEmitter.js"
import asyncPool from "tiny-async-pool"
import { determinePackageManagerEnv, PM } from "./node-module-collector/index.js"
import _fsExtra from "fs-extra"
const { chmod, mkdirs, outputFile } = _fsExtra
import { setSevenZipPath } from "./toolsets/7zip.js"
import { getCustomToolsetPath } from "./toolsets/custom.js"

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

  private readonly _packageManager: Lazy<{ pm: PM; workspaceRoot: Promise<string | undefined> }>
  async getPackageManager(): Promise<PM> {
    return (await this._packageManager.value).pm
  }
  async getWorkspaceRoot(): Promise<string> {
    return (await (await this._packageManager.value).workspaceRoot) || this.projectDir
  }

  /** Stores original metadata merged with extraMetadata from configuration. */
  private _metadata: Metadata | null = null
  get metadata(): Metadata {
    return this._metadata!
  }

  /** Stores original metadata from package.json before merging with extraMetadata. */
  private _originalMetadata: Metadata | null = null
  get originalMetadata(): Metadata {
    return this._originalMetadata!
  }

  /** The "name" field from package.json. */
  get nodePackageName() {
    return this.originalMetadata.name!
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

  // Tasks that must run after EVERY target has finished building — the only point at which the
  // shared appOutDir can be mutated without racing a concurrent target that reads it. Used by NSIS
  // to write elevate.exe into win-unpacked without it leaking into Squirrel/zip/etc. (see #9852).
  private readonly buildFinalizeTasks: Array<() => Promise<void>> = []

  addBuildFinalizeTask(task: () => Promise<void>): void {
    this.buildFinalizeTasks.push(task)
  }

  private _repositoryInfo = new Lazy<SourceRepositoryInfo | null>(() => getRepositoryInfo(this.projectDir, this.metadata, this.devMetadata))

  readonly options: PackagerOptions

  readonly debugLogger = new DebugLogger(log.isDebugEnabled)

  get repositoryInfo(): Promise<SourceRepositoryInfo | null> {
    return this._repositoryInfo.value
  }

  private runtimeEnvironmentVariables: NodeJS.ProcessEnv = {}

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

    this.projectDir = sanitizeDirPath(options.projectDir == null ? process.cwd() : options.projectDir)
    this._appDir = this.projectDir
    this._packageManager = determinePackageManagerEnv({ projectDir: this.projectDir, appDir: this.appDir, workspaceRoot: undefined })

    this.options = {
      ...options,
      prepackaged: options.prepackaged == null ? null : sanitizeDirPath(path.resolve(this.projectDir, options.prepackaged)),
    }

    log.info({ version: PACKAGE_VERSION, os: getOsRelease() }, "electron-builder")
  }

  private async addPackagerEventHandlers() {
    const { type } = this.appInfo
    const root = await this.getWorkspaceRoot()
    this.eventEmitter.on("artifactBuildStarted", await resolveFunction(type, this.config.artifactBuildStarted, "artifactBuildStarted", root), "user")
    this.eventEmitter.on("artifactBuildCompleted", await resolveFunction(type, this.config.artifactBuildCompleted, "artifactBuildCompleted", root), "user")

    this.eventEmitter.on("appxManifestCreated", await resolveFunction(type, this.config.appxManifestCreated, "appxManifestCreated", root), "user")
    this.eventEmitter.on("msiProjectCreated", await resolveFunction(type, this.config.msiProjectCreated, "msiProjectCreated", root), "user")

    this.eventEmitter.on("beforePack", await resolveFunction(type, this.config.beforePack, "beforePack", root), "user")
    this.eventEmitter.on("afterExtract", await resolveFunction(type, this.config.afterExtract, "afterExtract", root), "user")
    this.eventEmitter.on("afterPack", await resolveFunction(type, this.config.afterPack, "afterPack", root), "user")
    this.eventEmitter.on("afterSign", await resolveFunction(type, this.config.afterSign, "afterSign", root), "user")
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

    log.debug({ config: getSafeEffectiveConfig(configuration) }, "effective config")

    this._appDir = await computeDefaultAppDirectory(projectDir, configuration.directories!.app)
    this.isTwoPackageJsonProjectLayoutUsed = this._appDir !== projectDir

    const appPackageFile = this.isTwoPackageJsonProjectLayoutUsed ? path.join(this.appDir, "package.json") : devPackageFile

    // tslint:disable:prefer-conditional-expression
    if (this.devMetadata != null && !this.isTwoPackageJsonProjectLayoutUsed) {
      this._metadata = this.devMetadata
    } else {
      this._metadata = await this.readProjectMetadataIfTwoPackageStructureOrPrepacked(appPackageFile)
    }
    this._originalMetadata = deepAssign({}, this._metadata)
    deepAssign(this._metadata, configuration.extraMetadata)

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

    this._framework = await createElectronFrameworkSupport(this.config, this)

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

    this.disposeOnBuildFinish(() =>
      retry(() => this.tempDirManager.cleanup(), {
        retries: 2,
        interval: 2000,
        backoff: 2000,
        cancellationToken: this.cancellationToken,
        shouldRetry: e => {
          const message: string = e?.message || ""
          const code = e?.code
          // windows file locks
          const resourceIsBusy = message.includes("EBUSY") || code === "EBUSY"
          if (resourceIsBusy) {
            log.debug({ error: message || code }, "retrying temporary directory cleanup")
            return true
          }
          return false
        },
      })
    )

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
    const sevenZipConfig = this.config.toolsets?.sevenZip
    if (typeof sevenZipConfig === "object" && sevenZipConfig != null) {
      const toolDir = await getCustomToolsetPath(sevenZipConfig, this.buildResourcesDir)
      const bin = path.join(toolDir, "bin", process.platform === "win32" ? "7za.exe" : "7za")
      if (process.platform !== "win32") {
        await chmod(bin, 0o755)
      }
      setSevenZipPath(bin)
    }

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

      let poolCount = Math.floor(packager.config.concurrency?.jobs || 1)
      if (poolCount < 1) {
        log.warn({ concurrency: poolCount }, "concurrency is invalid, overriding with job count: 1")
        poolCount = 1
      } else if (poolCount > MAX_FILE_REQUESTS) {
        log.warn(
          { concurrency: poolCount, MAX_FILE_REQUESTS },
          `job concurrency is greater than recommended MAX_FILE_REQUESTS, this may lead to File Descriptor errors (too many files open). Proceed with caution (e.g. this is an experimental feature)`
        )
      }
      const packPromises: Promise<any>[] = []

      for (const [arch, targetNames] of computeArchToTargetNamesMap(archToType, packager, platform)) {
        if (this.cancellationToken.cancelled) {
          break
        }

        // support os and arch macro in output value
        const outDir = path.resolve(this.projectDir, packager.expandMacro(this.config.directories!.output!, Arch[arch]))
        const targetList = createTargets(nameToTarget, targetNames.length === 0 ? packager.defaultTarget : targetNames, outDir, packager)
        await createOutDirIfNeed(targetList, createdOutDirs)
        const promise = packager.pack(outDir, arch, targetList, taskManager)
        if (poolCount < 2) {
          await promise
        } else {
          packPromises.push(promise)
        }
      }

      await asyncPool(poolCount, packPromises, async it => {
        if (this.cancellationToken.cancelled) {
          return
        }
        await it
      })

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
      if (this.cancellationToken.cancelled) {
        break
      }
      await target.finishBuild()
    }

    // Every target has now finished reading the shared appOutDir(s), so finalize tasks may safely
    // mutate them (e.g. NSIS copying elevate.exe into win-unpacked — see #9852).
    for (const task of this.buildFinalizeTasks) {
      if (this.cancellationToken.cancelled) {
        break
      }
      await task()
    }
    return platformToTarget
  }

  private async createHelper(platform: Platform): Promise<PlatformPackager<any>> {
    if (this.options.platformPackagerFactory != null) {
      return this.options.platformPackagerFactory(this, platform)
    }

    switch (platform) {
      case Platform.MAC: {
        const helperClass = (await import("./macPackager.js")).MacPackager
        return new helperClass(this)
      }

      case Platform.WINDOWS: {
        const helperClass = (await import("./winPackager.js")).WinPackager
        return new helperClass(this)
      }

      case Platform.LINUX:
        return new (await import("./linuxPackager.js")).LinuxPackager(this)

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
    if (config.nativeModules?.nodeGypRebuild === true) {
      await nodeGypRebuild(platform.nodeName, Arch[arch], frameworkInfo)
    }

    if (config.nativeModules?.npmRebuild === false) {
      log.info({ reason: "nativeModules.npmRebuild is set to false" }, "skipped dependencies rebuild")
      return
    }

    const beforeBuild = await resolveFunction(this.appInfo.type, config.beforeBuild, "beforeBuild", await this.getWorkspaceRoot())
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

    if (config.nativeModules?.buildDependenciesFromSource === true && platform.nodeName !== process.platform) {
      log.info({ reason: "platform is different and nativeModules.buildDependenciesFromSource is set to true" }, "skipped dependencies rebuild")
    } else {
      await installOrRebuild(
        config,
        { appDir: this.appDir, projectDir: this.projectDir, workspaceRoot: await this.getWorkspaceRoot() },
        {
          frameworkInfo,
          platform: platform.nodeName,
          arch: Arch[arch],
        },
        false,
        this.runtimeEnvironmentVariables
      )
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
