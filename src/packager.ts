import * as path from "path"
import { computeDefaultAppDirectory, getElectronVersion, use, exec, isEmptyOrSpaces } from "./util/util"
import { all, executeFinally } from "./util/promise"
import { EventEmitter } from "events"
import BluebirdPromise from "bluebird-lst-c"
import { AppMetadata, DevMetadata, Platform, Arch } from "./metadata"
import { PlatformPackager, BuildInfo, ArtifactCreated, Target } from "./platformPackager"
import { WinPackager } from "./winPackager"
import * as errorMessages from "./errorMessages"
import * as util from "util"
import { deepAssign } from "./util/deepAssign"
import { lt as isVersionLessThan } from "semver"
import { warn, log } from "./util/log"
import { AppInfo } from "./appInfo"
import MacPackager from "./macPackager"
import { createTargets } from "./targets/targetFactory"
import { readPackageJson } from "./util/readPackageJson"
import { TmpDir } from "./util/tmp"
import { BuildOptions } from "./builder"
import { getGypEnv, installOrRebuild } from "./yarn"

function addHandler(emitter: EventEmitter, event: string, handler: Function) {
  emitter.on(event, handler)
}

export class Packager implements BuildInfo {
  readonly projectDir: string
  appDir: string

  metadata: AppMetadata
  devMetadata: DevMetadata

  isTwoPackageJsonProjectLayoutUsed = true

  electronVersion: string

  readonly eventEmitter = new EventEmitter()

  appInfo: AppInfo

  readonly tempDirManager = new TmpDir()

  //noinspection JSUnusedGlobalSymbols
  constructor(public options: BuildOptions) {
    this.projectDir = options.projectDir == null ? process.cwd() : path.resolve(options.projectDir)
  }

  artifactCreated(handler: (event: ArtifactCreated) => void): Packager {
    addHandler(this.eventEmitter, "artifactCreated", handler)
    return this
  }

  get devPackageFile(): string {
    return path.join(this.projectDir, "package.json")
  }

  async build(): Promise<Map<Platform, Map<String, Target>>> {
    const devPackageFile = this.devPackageFile

    const extraMetadata = this.options.extraMetadata
    const extraBuildMetadata = extraMetadata == null ? null : extraMetadata.build

    this.devMetadata = deepAssign(await readPackageJson(devPackageFile), this.options.devMetadata)
    if (extraMetadata != null) {
      if (extraBuildMetadata != null) {
        deepAssign(this.devMetadata, {build: extraBuildMetadata})
        delete extraMetadata.build
      }
      if (extraMetadata.directories != null) {
        deepAssign(this.devMetadata, {directories: extraMetadata.directories})
        delete extraMetadata.directories
      }
    }

    this.appDir = await computeDefaultAppDirectory(this.projectDir, use(this.devMetadata.directories, it => it!.app))

    this.isTwoPackageJsonProjectLayoutUsed = this.appDir !== this.projectDir

    const appPackageFile = this.isTwoPackageJsonProjectLayoutUsed ? path.join(this.appDir, "package.json") : devPackageFile
    if (this.isTwoPackageJsonProjectLayoutUsed) {
      this.metadata = deepAssign(await readPackageJson(appPackageFile), this.options.appMetadata, extraMetadata)
    }
    else {
      if (this.options.appMetadata != null) {
        deepAssign(this.devMetadata, this.options.appMetadata)
      }
      if (extraMetadata != null) {
        deepAssign(this.devMetadata, extraMetadata)
      }
      this.metadata = <any>this.devMetadata
    }

    this.checkMetadata(appPackageFile, devPackageFile)
    checkConflictingOptions(this.devMetadata.build)

    this.electronVersion = await getElectronVersion(this.devMetadata, devPackageFile)

    this.appInfo = new AppInfo(this.metadata, this.devMetadata)
    const cleanupTasks: Array<() => Promise<any>> = []
    return await executeFinally(this.doBuild(cleanupTasks), () => all(cleanupTasks.map(it => it()).concat(this.tempDirManager.cleanup())))
  }

  private async doBuild(cleanupTasks: Array<() => Promise<any>>): Promise<Map<Platform, Map<String, Target>>> {
    const distTasks: Array<Promise<any>> = []
    const outDir = path.resolve(this.projectDir, use(this.devMetadata.directories, it => it!.output) || "dist")

    const platformToTarget: Map<Platform, Map<String, Target>> = new Map()
    // custom packager - don't check wine
    let checkWine = this.options.platformPackagerFactory == null
    for (let [platform, archToType] of this.options.targets!) {
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

      for (let [arch, targets] of archToType) {
        await this.installAppDependencies(platform, arch)

        if (checkWine && wineCheck != null) {
          checkWine = false
          await checkWineVersion(wineCheck)
        }

        await helper.pack(outDir, arch, createTargets(nameToTarget, targets, outDir, helper, cleanupTasks), distTasks)
      }

      for (let target of nameToTarget.values()) {
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

    const build = <any>this.devMetadata.build
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

      if (build.directories != null) {
        throw new Error(`'directories' in the 'build' is not correct. Please move 'directories' from 'build' to root`)
      }

      if (build.prune != null) {
        warn("prune is deprecated — development dependencies are never copied in any case")
      }
    }
  }

  private async installAppDependencies(platform: Platform, arch: Arch): Promise<any> {
    const options = this.devMetadata.build
    if (options.nodeGypRebuild === true) {
      log(`Executing node-gyp rebuild for arch ${Arch[arch]}`)
      await exec(process.platform === "win32" ? "node-gyp.cmd" : "node-gyp", ["rebuild"], {
        env: getGypEnv(this.electronVersion, Arch[arch]),
      })
    }

    if (options.npmRebuild === false) {
      log("Skip app dependencies rebuild because npmRebuild is set to false")
      return
    }

    if (options.npmSkipBuildFromSource !== true && platform.nodeName !== process.platform) {
      log("Skip app dependencies rebuild because platform is different")
    }
    else {
      await installOrRebuild(options, this.appDir, this.electronVersion, Arch[arch])
    }
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
  for (let name of ["all", "out", "tmpdir", "version", "platform", "dir", "arch", "name", "extra-resource"]) {
    if (name in options) {
      throw new Error(`Option ${name} is ignored, do not specify it.`)
    }
  }
}

async function checkWineVersion(checkPromise: Promise<string>) {
  function wineError(prefix: string): string {
    return `${prefix}, please see https://github.com/electron-userland/electron-builder/wiki/Multi-Platform-Build#${(process.platform === "linux" ? "linux" : "os-x")}`
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

  for (let name of ["electron", "electron-prebuilt", "electron-builder"]) {
    if (name in dependencies) {
      throw new Error(`${name} must be in the devDependencies`)
    }
  }
}