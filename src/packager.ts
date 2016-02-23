import * as fs from "fs"
import * as path from "path"
import { DEFAULT_APP_DIR_NAME, installDependencies, log, getElectronVersion, readPackageJson } from "./util"
import { all, executeFinally } from "./promise"
import { EventEmitter } from "events"
import { Promise as BluebirdPromise } from "bluebird"
import { tsAwaiter } from "./awaiter"
import { AppMetadata, InfoRetriever } from "./repositoryInfo"
import { PackagerOptions, PlatformPackager, BuildInfo, DevMetadata } from "./platformPackager"
import MacPackager from "./macPackager"
import WinPackager from "./winPackager"
import * as errorMessages from "./errorMessages"
import * as util from "util"

const __awaiter = tsAwaiter
Array.isArray(__awaiter)

function addHandler(emitter: EventEmitter, event: string, handler: Function) {
  emitter.on(event, handler)
}

export class Packager implements BuildInfo {
  projectDir: string

  appDir: string

  metadata: AppMetadata
  devMetadata: DevMetadata

  private isTwoPackageJsonProjectLayoutUsed = true

  electronVersion: string

  eventEmitter = new EventEmitter()

  //noinspection JSUnusedLocalSymbols
  constructor(public options: PackagerOptions, public repositoryInfo: InfoRetriever = null) {
    this.projectDir = options.projectDir == null ? process.cwd() : path.resolve(options.projectDir)
    this.appDir = this.computeAppDirectory()
  }

  artifactCreated(handler: (path: string) => void): Packager {
    addHandler(this.eventEmitter, "artifactCreated", handler)
    return this
  }

  get devPackageFile(): string {
    return path.join(this.projectDir, "package.json")
  }

  async build(): Promise<any> {
    const buildPackageFile = this.devPackageFile
    const appPackageFile = this.projectDir === this.appDir ? buildPackageFile : path.join(this.appDir, "package.json")
    const platforms = normalizePlatforms(this.options.platform)
    await BluebirdPromise.all(Array.from(new Set([buildPackageFile, appPackageFile]), readPackageJson))
      .then(result => {
        this.metadata = result[result.length - 1]
        this.devMetadata = result[0]
        this.checkMetadata(appPackageFile, platforms)

        this.electronVersion = getElectronVersion(this.devMetadata, buildPackageFile)
      })

    const cleanupTasks: Array<() => Promise<any>> = []
    return executeFinally(this.doBuild(platforms, cleanupTasks), error => all(cleanupTasks.map(it => it())))
  }

  private async doBuild(platforms: Array<string>, cleanupTasks: Array<() => Promise<any>>): Promise<any> {
    const distTasks: Array<Promise<any>> = []
    for (let platform of platforms) {
      const helper = this.createHelper(platform, cleanupTasks)
      const archs = platform === "darwin" ? ["x64"] : (this.options.arch == null || this.options.arch === "all" ? ["ia32", "x64"] : [this.options.arch])
      for (let arch of archs) {
        await this.installAppDependencies(arch)

        helper.currentArch = arch
        const outDir = path.join(this.projectDir, "dist")
        const appOutDir = path.join(outDir, this.metadata.name + "-" + platform + "-" + arch)
        await helper.pack(platform, outDir, appOutDir)
        if (this.options.dist) {
          distTasks.push(helper.packageInDistributableFormat(outDir, appOutDir))
        }
      }
    }

    return await BluebirdPromise.all(distTasks)
  }

  private createHelper(platform: string, cleanupTasks: Array<() => Promise<any>>): PlatformPackager<any> {
    switch (platform) {
      case "darwin":
      case "osx":
      {
        const helperClass: typeof MacPackager = require("./macPackager").default
        return new helperClass(this, cleanupTasks)
      }

      case "win32":
      case "win":
      case "windows":
      {
        const helperClass: typeof WinPackager = require("./winPackager").default
        return new helperClass(this, cleanupTasks)
      }

      case "linux":
        return new (require("./linuxPackager").LinuxPackager)(this)

      default:
        throw new Error("Unsupported platform: " + platform)
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
      fs.accessSync(absoluteAppPath)
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

  private checkMetadata(appPackageFile: string, platforms: Array<string>): void {
    const reportError = (missedFieldName: string) => {
      throw new Error("Please specify '" + missedFieldName + "' in the application package.json ('" + appPackageFile + "')")
    }

    const metadata = this.metadata
    if (metadata.name == null) {
      reportError("name")
    }
    else if (metadata.description == null) {
      reportError("description")
    }
    else if (metadata.version == null) {
      reportError("version")
    }
    else if (metadata.build == null) {
      throw new Error(util.format(errorMessages.buildIsMissed, appPackageFile))
    }
    else {
      const author = metadata.author
      if (author == null) {
        reportError("author")
      }
      else if (this.options.dist && author.email == null && platforms.includes("linux")) {
        throw new Error(util.format(errorMessages.authorEmailIsMissed, appPackageFile))
      }
    }
  }

  private installAppDependencies(arch: string): Promise<any> {
    if (this.isTwoPackageJsonProjectLayoutUsed) {
      return installDependencies(this.appDir, arch, this.electronVersion)
    }
    else {
      log("Skipping app dependencies installation because dev and app dependencies are not separated")
      return BluebirdPromise.resolve(null)
    }
  }
}

function normalizePlatforms(platforms: Array<string>): Array<string> {
  if (platforms == null || platforms.length === 0) {
    return [process.platform]
  }
  else if (platforms[0] === "all") {
    if (process.platform === "darwin") {
      return ["darwin", "linux", "win32"]
    }
    else if (process.platform === "linux") {
      // OS X code sign works only on OS X
      return ["linux", "win32"]
    }
    else {
      return ["win32"]
    }
  }
  else {
    return platforms
  }
}
