import * as fs from "fs"
import * as path from "path"
import { DEFAULT_APP_DIR_NAME, installDependencies, log, getElectronVersion } from "./util"
import { parseJsonFile } from "./promisifed-fs"
import { all, executeFinally } from "./promise"
import { EventEmitter } from "events"
import { Promise as BluebirdPromise } from "bluebird"
import { tsAwaiter } from "./awaiter"
import { AppMetadata, InfoRetriever } from "./repositoryInfo"
import { PackagerOptions, PlatformPackager, BuildInfo, DevMetadata } from "./platformPackager"
import MacPackager from "./macPackager"
import WinPackager from "./winPackager"
import LinuxPackager from "./linuxPackager"

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
    await BluebirdPromise.all(Array.from(new Set([buildPackageFile, appPackageFile]), parseJsonFile))
      .then((result: any[]) => {
        this.metadata = result[result.length - 1]
        this.devMetadata = result[0]
        this.checkMetadata(appPackageFile)

        this.electronVersion = getElectronVersion(this.devMetadata, buildPackageFile)
      })

    const cleanupTasks: Array<() => Promise<any>> = []
    return executeFinally(this.doBuild(cleanupTasks), error => all(cleanupTasks.map(it => it())))
  }

  private async doBuild(cleanupTasks: Array<() => Promise<any>>): Promise<any> {
    const platforms = this.options.platform === "all" ? getSupportedPlatforms() : [this.options.platform || process.platform]
    const distTasks: Array<Promise<any>> = []
    for (let platform of platforms) {
      const helper = this.createHelper(platform, cleanupTasks)
      const archs = platform === "darwin" ? ["x64"] : (this.options.arch == null || this.options.arch === "all" ? ["ia32", "x64"] : [this.options.arch])
      for (let arch of archs) {
        await this.installAppDependencies(arch)

        const outDir = path.join(this.projectDir, "dist", this.metadata.name + "-" + platform + "-" + arch)
        await helper.pack(platform, arch, outDir)
        if (this.options.dist) {
          const buildMetadata: any = this.devMetadata.build
          const customConfiguration = buildMetadata == null ? buildMetadata : buildMetadata[helper.getBuildConfigurationKey()]
          distTasks.push(helper.packageInDistributableFormat(outDir, customConfiguration, arch))
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
      {
        const helperClass: typeof LinuxPackager = require("./linuxPackager").default
        return new helperClass(this)
      }

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

    let absoluteAppPath = path.join(this.projectDir, customAppPath)
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

  private checkMetadata(appPackageFile: string): void {
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
      throw new Error("Please specify 'build' configuration in the application package.json ('" + appPackageFile + "'), at least\n\n" +
          JSON.stringify({
            build: {
              "app-bundle-id": "your.id",
              "app-category-type": "your.app.category.type",
              "iconUrl": "see https://github.com/develar/electron-complete-builder#in-short",
            }
          }, null, "  ") + "\n\n is required.\n")
    }
    else if (metadata.author == null) {
      reportError("author")
    }
  }

  private installAppDependencies(arch: string): Promise<any> {
    if (this.isTwoPackageJsonProjectLayoutUsed) {
      return installDependencies(this.appDir, arch, this.electronVersion)
    }
    else {
      log("Skipping app dependencies installation because dev and app dependencies are not separated")
      return Promise.resolve(null)
    }
  }
}

function getSupportedPlatforms(): string[] {
  if (process.platform === "darwin") {
    return ["darwin", "win32", "linux"]
  }
  else if (process.platform === "win32") {
    return ["win32"]
  }
  else {
    return ["linux", "win32"]
  }
}
