import { accessSync } from "fs"
import * as path from "path"
import { DEFAULT_APP_DIR_NAME, installDependencies, log, getElectronVersion, readPackageJson } from "./util"
import { all, executeFinally } from "./promise"
import { EventEmitter } from "events"
import { Promise as BluebirdPromise } from "bluebird"
import { InfoRetriever } from "./repositoryInfo"
import { AppMetadata, DevMetadata, Platform } from "./metadata"
import { PackagerOptions, PlatformPackager, BuildInfo, ArtifactCreated, use } from "./platformPackager"
import MacPackager from "./macPackager"
import { WinPackager } from "./winPackager"
import * as errorMessages from "./errorMessages"
import * as util from "util"
import deepAssign = require("deep-assign")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

function addHandler(emitter: EventEmitter, event: string, handler: Function) {
  emitter.on(event, handler)
}

export class Packager implements BuildInfo {
  readonly projectDir: string
  readonly appDir: string

  metadata: AppMetadata
  devMetadata: DevMetadata

  private isTwoPackageJsonProjectLayoutUsed = true

  electronVersion: string

  readonly eventEmitter = new EventEmitter()

  //noinspection JSUnusedGlobalSymbols
  constructor(public options: PackagerOptions, public repositoryInfo: InfoRetriever = null) {
    this.projectDir = options.projectDir == null ? process.cwd() : path.resolve(options.projectDir)
    this.appDir = this.computeAppDirectory()
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
    const appPackageFile = this.projectDir === this.appDir ? devPackageFile : path.join(this.appDir, "package.json")
    const platforms = this.options.platform

    const metadataList = await BluebirdPromise.map(Array.from(new Set([devPackageFile, appPackageFile])), readPackageJson)
    this.metadata = metadataList[metadataList.length - 1]
    this.devMetadata = deepAssign(metadataList[0], this.options.devMetadata)
    this.checkMetadata(appPackageFile, devPackageFile, platforms)

    this.electronVersion = await getElectronVersion(this.devMetadata, devPackageFile)

    const cleanupTasks: Array<() => Promise<any>> = []
    return executeFinally(this.doBuild(platforms, cleanupTasks), () => all(cleanupTasks.map(it => it())))
  }

  private async doBuild(platforms: Array<Platform>, cleanupTasks: Array<() => Promise<any>>): Promise<any> {
    const distTasks: Array<Promise<any>> = []
    const outDir = path.resolve(this.projectDir, use(this.devMetadata.directories, it => it.output) || "dist")

    for (let platform of platforms) {
      const helper = this.createHelper(platform, cleanupTasks)
      for (let arch of normalizeArchs(platform, this.options.arch)) {
        await this.installAppDependencies(arch)
        // electron-packager uses productName in the directory name
        const appOutDir = path.join(outDir, `${helper.appName}-${platform.nodeName}-${arch}`)
        await helper.pack(outDir, appOutDir, arch)
        if (this.options.dist) {
          distTasks.push(helper.packageInDistributableFormat(outDir, appOutDir, arch))
        }
      }
    }

    return await BluebirdPromise.all(distTasks)
  }

  private createHelper(platform: Platform, cleanupTasks: Array<() => Promise<any>>): PlatformPackager<any> {
    if (this.options.platformPackagerFactory != null) {
      return this.options.platformPackagerFactory(this,  platform, cleanupTasks)
    }

    switch (platform) {
      case Platform.OSX:
      {
        const helperClass: typeof MacPackager = require("./macPackager").default
        return new helperClass(this, cleanupTasks)
      }

      case Platform.WINDOWS:
      {
        const helperClass: typeof WinPackager = require("./winPackager").WinPackager
        return new helperClass(this, cleanupTasks)
      }

      case Platform.LINUX:
        return new (require("./linuxPackager").LinuxPackager)(this)

      default:
        throw new Error("Unknown platform: " + platform)
    }
  }

  // Auto-detect app/ (two package.json project layout (development and app)) or fallback to use working directory if not explicitly specified
  private computeAppDirectory(): string {
    let customAppPath = this.options.appDir
    let required = true
    if (customAppPath == null) {
      customAppPath = DEFAULT_APP_DIR_NAME
      required = false
    }

    const absoluteAppPath = path.join(this.projectDir, customAppPath)
    try {
      accessSync(absoluteAppPath)
    }
    catch (e) {
      if (required) {
        throw new Error(customAppPath + " doesn't exists, " + e.message)
      }
      else {
        this.isTwoPackageJsonProjectLayoutUsed = false
        return this.projectDir
      }
    }
    return absoluteAppPath
  }

  private checkMetadata(appPackageFile: string, devAppPackageFile: string, platforms: Array<Platform>): void {
    const reportError = (missedFieldName: string) => {
      throw new Error("Please specify '" + missedFieldName + "' in the application package.json ('" + appPackageFile + "')")
    }

    const appMetadata = this.metadata
    if (appMetadata.name == null) {
      reportError("name")
    }
    else if (appMetadata.description == null) {
      reportError("description")
    }
    else if (appMetadata.version == null) {
      reportError("version")
    }
    else if ((<any>appMetadata) !== this.devMetadata) {
      if ((<any>appMetadata).build != null) {
        throw new Error(util.format(errorMessages.buildInAppSpecified, appPackageFile, devAppPackageFile))
      }

      if (this.devMetadata.homepage != null) {
        console.warn("homepage in the development package.json is deprecated, please move to the application package.json")
      }
      if (this.devMetadata.license != null) {
        console.warn("license in the development package.json is deprecated, please move to the application package.json")
      }
    }

    if (this.devMetadata.build == null) {
      throw new Error(util.format(errorMessages.buildIsMissed, devAppPackageFile))
    }
    else {
      const author = appMetadata.author
      if (author == null) {
        reportError("author")
      }
      else if (this.options.dist && author.email == null && platforms.includes(Platform.LINUX)) {
        throw new Error(util.format(errorMessages.authorEmailIsMissed, appPackageFile))
      }
    }
  }

  private installAppDependencies(arch: string): Promise<any> {
    if (this.isTwoPackageJsonProjectLayoutUsed) {
      return installDependencies(this.appDir, this.electronVersion, arch, "rebuild")
    }
    else {
      log("Skipping app dependencies installation because dev and app dependencies are not separated")
      return BluebirdPromise.resolve()
    }
  }
}

export function normalizeArchs(platform: Platform, arch?: string) {
  if (platform === Platform.OSX) {
    return ["x64"]
  }
  else {
    return arch == null ? [process.arch] : (arch === "all" ? ["ia32", "x64"] : [arch])
  }
}

export function normalizePlatforms(platforms: Array<string | Platform>): Array<Platform> {
  if (platforms == null || platforms.length === 0) {
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
    return platforms.map(it => it instanceof Platform ? it : Platform.fromString(it))
  }
}
