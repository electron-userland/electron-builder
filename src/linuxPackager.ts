import * as path from "path"
import { Promise as BluebirdPromise } from "bluebird"
import { PlatformPackager, BuildInfo, Target } from "./platformPackager"
import { Platform, LinuxBuildOptions, Arch } from "./metadata"
import { FpmTarget } from "./targets/fpm"
import { createCommonTarget, DEFAULT_TARGET } from "./targets/targetFactory"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export const installPrefix = "/opt"

export class LinuxPackager extends PlatformPackager<LinuxBuildOptions> {
  constructor(info: BuildInfo) {
    super(info)
  }

  normalizePlatformSpecificBuildOptions(options: LinuxBuildOptions | n): LinuxBuildOptions {
    if (options != null && options.description != null) {
      return options
    }
    else {
      return Object.assign({
        description: this.appInfo.description,
      }, options)
    }
  }

  createTargets(targets: Array<string>, mapper: (name: string, factory: () => Target) => void, cleanupTasks: Array<() => Promise<any>>): void {
    for (let name of targets) {
      if (name === "dir") {
        continue
      }

      if (name === DEFAULT_TARGET || name === "deb") {
        mapper("deb", () => new FpmTarget("deb", this, cleanupTasks))
      }
      else if (name === "rpm" || name === "sh" || name === "freebsd" || name === "pacman" || name === "apk" || name === "p5p") {
        mapper(name, () => new FpmTarget(name, this,  cleanupTasks))
      }
      else {
        mapper(name, () => createCommonTarget(name))
      }
    }
  }

  get platform() {
    return Platform.LINUX
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    const appOutDir = this.computeAppOutDir(outDir, arch)
    await this.doPack(await this.computePackOptions(outDir, appOutDir, arch), outDir, appOutDir, arch, this.platformSpecificBuildOptions)

    postAsyncTasks.push(this.packageInDistributableFormat(outDir, appOutDir, arch, targets))
  }

  protected async packageInDistributableFormat(outDir: string, appOutDir: string, arch: Arch, targets: Array<Target>): Promise<any> {
    // todo fix fpm - if run in parallel, get strange tar errors
    for (let t of targets) {
      if (t instanceof FpmTarget) {
        const target = t.name
        const destination = path.join(outDir, this.generateName(target, arch, true /* on Linux we use safe name — without space */))
        await t.build(destination, target, appOutDir, arch)
        this.dispatchArtifactCreated(destination)
      }
    }

    const promises: Array<Promise<any>> = []
    // https://github.com/electron-userland/electron-builder/issues/460
    // for some reasons in parallel to fmp we cannot use tar
    for (let t of targets) {
      const target = t.name
      if (target === "zip" || target === "7z" || target.startsWith("tar.")) {
        const destination = path.join(outDir, this.generateName(target, arch, true))
        promises.push(this.archiveApp(target, appOutDir, destination)
          .then(() => this.dispatchArtifactCreated(destination)))
      }
    }

    if (promises.length > 0) {
      await BluebirdPromise.all(promises)
    }
  }
}