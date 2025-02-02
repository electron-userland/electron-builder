import { SignOptions as MacSignOptions } from "@electron/osx-sign/dist/cjs/types"
import { Identity } from "app-builder-lib/"
import { MacPackager } from "app-builder-lib/"
import { DoPackOptions } from "app-builder-lib/"
import { WinPackager } from "app-builder-lib/"
import { AsyncTaskManager } from "builder-util"
import { DmgTarget } from "dmg-builder"
import { Arch, MacConfiguration, Packager, Target } from "electron-builder"
import SquirrelWindowsTarget from "electron-builder-squirrel-windows"

export class CheckingWinPackager extends WinPackager {
  effectiveDistOptions: any

  constructor(info: Packager) {
    super(info)
  }

  //noinspection JSUnusedLocalSymbols
  async pack(outDir: string, arch: Arch, targets: Array<Target>, taskManager: AsyncTaskManager): Promise<any> {
    // skip pack
    const helperClass: typeof SquirrelWindowsTarget = (await import("electron-builder-squirrel-windows")).default
    this.effectiveDistOptions = await new helperClass(this, outDir).computeEffectiveDistOptions()

    await this.sign(this.computeAppOutDir(outDir, arch))
  }

  //noinspection JSUnusedLocalSymbols
  packageInDistributableFormat(appOutDir: string, arch: Arch, targets: Array<Target>, taskManager: AsyncTaskManager): void {
    // skip
  }
}

export class CheckingMacPackager extends MacPackager {
  effectiveDistOptions: any
  effectiveSignOptions: MacSignOptions | null = null

  constructor(info: Packager) {
    super(info)
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, taskManager: AsyncTaskManager): Promise<any> {
    for (const target of targets) {
      // do not use instanceof to avoid dmg require
      if (target.name === "dmg") {
        this.effectiveDistOptions = await (target as DmgTarget).computeDmgOptions()
        break
      }
    }
    // http://madole.xyz/babel-plugin-transform-async-to-module-method-gotcha/
    return await MacPackager.prototype.pack.call(this, outDir, arch, targets, taskManager)
  }

  //noinspection JSUnusedLocalSymbols
  async doPack(_options: DoPackOptions<MacConfiguration>) {
    // skip
  }

  //noinspection JSUnusedGlobalSymbols
  async doSign(opts: MacSignOptions): Promise<any> {
    this.effectiveSignOptions = opts
  }

  //noinspection JSUnusedGlobalSymbols,JSUnusedLocalSymbols
  async doFlat(appPath: string, outFile: string, identity: Identity, keychain?: string | null): Promise<any> {
    // skip
  }

  //noinspection JSUnusedGlobalSymbols,JSUnusedLocalSymbols
  packageInDistributableFormat(appOutDir: string, arch: Arch, targets: Array<Target>, taskManager: AsyncTaskManager): void {
    // skip
  }

  protected async writeUpdateInfo(appOutDir: string, outDir: string) {
    // ignored
  }
}
