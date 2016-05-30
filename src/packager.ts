import * as path from "path"
import {
  computeDefaultAppDirectory, installDependencies, log, getElectronVersion, readPackageJson, use, warn,
  exec
} from "./util"
import { all, executeFinally } from "./promise"
import { EventEmitter } from "events"
import { Promise as BluebirdPromise } from "bluebird"
import { InfoRetriever } from "./repositoryInfo"
import { AppMetadata, DevMetadata, Platform } from "./metadata"
import { PackagerOptions, PlatformPackager, BuildInfo, ArtifactCreated } from "./platformPackager"
import OsXPackager from "./osxPackager"
import { WinPackager } from "./winPackager"
import * as errorMessages from "./errorMessages"
import * as util from "util"
import deepAssign = require("deep-assign")
import compareVersions = require("compare-versions")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

function addHandler(emitter: EventEmitter, event: string, handler: Function) {
  emitter.on(event, handler)
}

export class Packager implements BuildInfo {
  readonly projectDir: string
  appDir: string

  metadata: AppMetadata
  devMetadata: DevMetadata

  private isTwoPackageJsonProjectLayoutUsed = true

  electronVersion: string

  readonly eventEmitter = new EventEmitter()

  //noinspection JSUnusedGlobalSymbols
  constructor(public options: PackagerOptions, public repositoryInfo: InfoRetriever | null = null) {
    this.projectDir = options.projectDir == null ? process.cwd() : path.resolve(options.projectDir)
  }

  artifactCreated(handler: (event: ArtifactCreated) => void): Packager {
    addHandler(this.eventEmitter, "artifactCreated", handler)
    return this
  }

  get devPackageFile(): string {
    return path.join(this.projectDir, "package.json")
  }

  async build(): Promise<any> {
    const devPackageFile = this.devPackageFile
    const platforms = this.options.platform!

    this.devMetadata = deepAssign(await readPackageJson(devPackageFile), this.options.devMetadata)
    this.appDir = await computeDefaultAppDirectory(this.projectDir, use(this.devMetadata.directories, it => it!.app))

    this.isTwoPackageJsonProjectLayoutUsed = this.appDir !== this.projectDir

    const appPackageFile = this.projectDir === this.appDir ? devPackageFile : path.join(this.appDir, "package.json")
    this.metadata = appPackageFile === devPackageFile ? this.devMetadata : await readPackageJson(appPackageFile)
    this.checkMetadata(appPackageFile, devPackageFile, platforms)
    checkConflictingOptions(this.devMetadata.build)

    this.electronVersion = await getElectronVersion(this.devMetadata, devPackageFile)

    const cleanupTasks: Array<() => Promise<any>> = []
    return executeFinally(this.doBuild(platforms, cleanupTasks), () => all(cleanupTasks.map(it => it())))
  }

  private async doBuild(platforms: Array<Platform>, cleanupTasks: Array<() => Promise<any>>): Promise<any> {
    const distTasks: Array<Promise<any>> = []
    const outDir = path.resolve(this.projectDir, use(this.devMetadata.directories, it => it!.output) || "dist")

    // custom packager - don't check wine
    let checkWine = this.options.platformPackagerFactory == null
    for (let platform of platforms) {
      let wineCheck: Promise<string> | null = null
      if (checkWine && process.platform !== "win32" && platform === Platform.WINDOWS) {
        wineCheck = exec("wine", ["--version"])
      }

      const helper = this.createHelper(platform!, cleanupTasks)
      for (let arch of normalizeArchs(platform!, this.options.arch)) {
        await this.installAppDependencies(platform!, arch!)

        if (checkWine && wineCheck != null) {
          checkWine = false
          checkWineVersion(wineCheck)
        }

        // electron-packager uses productName in the directory name
        await helper.pack(outDir, arch!, distTasks)}
    }

    return await BluebirdPromise.all(distTasks)
  }

  private createHelper(platform: Platform, cleanupTasks: Array<() => Promise<any>>): PlatformPackager<any> {
    if (this.options.platformPackagerFactory != null) {
      return this.options.platformPackagerFactory!(this,  platform, cleanupTasks)
    }

    switch (platform) {
      case Platform.OSX:
      {
        const helperClass: typeof OsXPackager = require("./osxPackager").default
        return new helperClass(this, cleanupTasks)
      }

      case Platform.WINDOWS:
      {
        const helperClass: typeof WinPackager = require("./winPackager").WinPackager
        return new helperClass(this, cleanupTasks)
      }

      case Platform.LINUX:
        return new (require("./linuxPackager").LinuxPackager)(this, cleanupTasks)

      default:
        throw new Error(`Unknown platform: ${platform}`)
    }
  }

  private checkMetadata(appPackageFile: string, devAppPackageFile: string, platforms: Array<Platform>): void {
    const reportError = (missedFieldName: string) => {
      throw new Error(`Please specify '${missedFieldName}' in the application package.json ('${appPackageFile}')`)
    }

    const checkNotEmpty = (name: string, value: string) => {
      if (isEmptyOrSpaces(value)) {
        reportError(name)
      }
    }

    const appMetadata = this.metadata

    checkNotEmpty("name", appMetadata.name)
    checkNotEmpty("description", appMetadata.description)
    checkNotEmpty("version", appMetadata.version)

    if ((<any>appMetadata) !== this.devMetadata) {
      if ((<any>appMetadata).build != null) {
        throw new Error(util.format(errorMessages.buildInAppSpecified, appPackageFile, devAppPackageFile))
      }

      if (this.devMetadata.homepage != null) {
        warn("homepage in the development package.json is deprecated, please move to the application package.json")
      }
      if (this.devMetadata.license != null) {
        warn("license in the development package.json is deprecated, please move to the application package.json")
      }
    }

    if (<any>this.devMetadata.build == null) {
      throw new Error(util.format(errorMessages.buildIsMissed, devAppPackageFile))
    }
    else {
      const author = appMetadata.author
      if (<any>author == null) {
        reportError("author")
      }
      else if (<any>author.email == null && platforms.includes(Platform.LINUX)) {
        throw new Error(util.format(errorMessages.authorEmailIsMissed, appPackageFile))
      }

      if ((<any>this.devMetadata.build).name != null) {
        throw new Error(util.format(errorMessages.nameInBuildSpecified, appPackageFile))
      }
    }
  }

  private installAppDependencies(platform: Platform, arch: string): Promise<any> {
    if (!this.options.npmRebuild) {
      log("Skip app dependencies rebuild because npmRebuild is set to false")
    }
    else if (this.isTwoPackageJsonProjectLayoutUsed) {
      if (platform.nodeName === process.platform) {
        return installDependencies(this.appDir, this.electronVersion, arch, "rebuild")
      }
      else {
        log("Skip app dependencies rebuild because platform is different")
      }
    }
    else {
      log("Skip app dependencies rebuild because dev and app dependencies are not separated")
    }

    return BluebirdPromise.resolve()
  }
}

export function normalizeArchs(platform: Platform, arch?: string | n) {
  if (platform === Platform.OSX) {
    return ["x64"]
  }
  else {
    return arch == null ? [process.arch] : (arch === "all" ? ["ia32", "x64"] : [arch])
  }
}

export function normalizePlatforms(rawPlatforms: Array<string | Platform> | string | Platform | n): Array<Platform> {
  const platforms = rawPlatforms == null || Array.isArray(rawPlatforms) ? (<Array<string | Platform | n>>rawPlatforms) : [rawPlatforms]
  if (<any>platforms == null || platforms.length === 0) {
    return [Platform.fromString(process.platform)]
  }
  else if (platforms[0] === "all") {
    if (process.platform === Platform.OSX.nodeName) {
      return [Platform.OSX, Platform.LINUX, Platform.WINDOWS]
    }
    else if (process.platform === Platform.LINUX.nodeName) {
      // OS X code sign works only on OS X
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
  for (let name of ["all", "out", "tmpdir", "version", "platform", "dir", "arch", "name"]) {
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
      throw new Error("Cannot check wine version: " + e)
    }
  }

  if (wineVersion.startsWith("wine-")) {
    wineVersion = wineVersion.substring("wine-".length)
  }

  if (compareVersions(wineVersion, "1.8") === -1) {
    throw new Error(wineError(`wine 1.8+ is required, but your version is ${wineVersion}`))
  }
}

function isEmptyOrSpaces(s: string | n) {
  return s == null || s.trim().length === 0
}