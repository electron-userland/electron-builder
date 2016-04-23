import * as path from "path"
import { computeDefaultAppDirectory, installDependencies, log, getElectronVersion, readPackageJson, use, warn } from "./util"
import { all, executeFinally } from "./promise"
import { EventEmitter } from "events"
import { Promise as BluebirdPromise } from "bluebird"
import { InfoRetriever } from "./repositoryInfo"
import { AppMetadata, DevMetadata, Platform } from "./metadata"
import { PackagerOptions, PlatformPackager, BuildInfo, ArtifactCreated } from "./platformPackager"
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
  appDir: string

  metadata: AppMetadata
  devMetadata: DevMetadata

  private isTwoPackageJsonProjectLayoutUsed = true

  electronVersion: string

  readonly eventEmitter = new EventEmitter()

  //noinspection JSUnusedGlobalSymbols
  constructor(public options: PackagerOptions, public repositoryInfo: InfoRetriever = null) {
    this.projectDir = options.projectDir == null ? process.cwd() : path.resolve(options.projectDir)
    if (this.appDir === this.projectDir) {
      this.isTwoPackageJsonProjectLayoutUsed = false
    }
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
    const platforms = this.options.platform

    this.devMetadata = deepAssign(await readPackageJson(devPackageFile), this.options.devMetadata)
    this.appDir = await computeDefaultAppDirectory(this.projectDir, use(this.devMetadata.directories, it => it.app) || this.options.appDir)
    const appPackageFile = this.projectDir === this.appDir ? devPackageFile : path.join(this.appDir, "package.json")
    this.metadata = appPackageFile === devPackageFile ? this.devMetadata : await readPackageJson(appPackageFile)
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
        await this.installAppDependencies(platform, arch)
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
        warn("homepage in the development package.json is deprecated, please move to the application package.json")
      }
      if (this.devMetadata.license != null) {
        warn("license in the development package.json is deprecated, please move to the application package.json")
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

  private installAppDependencies(platform: Platform, arch: string): Promise<any> {
    if (this.isTwoPackageJsonProjectLayoutUsed) {
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
