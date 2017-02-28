import { BuildInfo, MacOptions } from "electron-builder"
import { Arch, Target } from "electron-builder-core"
import SquirrelWindowsTarget from "electron-builder-squirrel-windows"
import OsXPackager from "electron-builder/out/macPackager"
import { DmgTarget } from "electron-builder/out/targets/dmg"
import { SignOptions } from "electron-builder/out/windowsCodeSign"
import { WinPackager } from "electron-builder/out/winPackager"
import { SignOptions as MacSignOptions } from "electron-macos-sign"

export class CheckingWinPackager extends WinPackager {
  effectiveDistOptions: any
  signOptions: SignOptions | null

  constructor(info: BuildInfo) {
    super(info)
  }

  //noinspection JSUnusedLocalSymbols
  async pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    // skip pack
    const helperClass: typeof SquirrelWindowsTarget = require("electron-builder-squirrel-windows").default
    this.effectiveDistOptions = await (new helperClass(this, outDir).computeEffectiveDistOptions())

    await this.sign(this.computeAppOutDir(outDir, arch))
  }

  //noinspection JSUnusedLocalSymbols
  packageInDistributableFormat(appOutDir: string, arch: Arch, targets: Array<Target>, promises: Array<Promise<any>>): void {
    // skip
  }

  //noinspection JSUnusedGlobalSymbols
  protected async doSign(opts: SignOptions): Promise<any> {
    this.signOptions = opts
  }
}

export class CheckingMacPackager extends OsXPackager {
  effectiveDistOptions: any
  effectiveSignOptions: MacSignOptions

  constructor(info: BuildInfo) {
    super(info)
  }

  async pack(outDir: string, arch: Arch, targets: Array<Target>, postAsyncTasks: Array<Promise<any>>): Promise<any> {
    for (const target of targets) {
      // do not use instanceof to avoid dmg require
      if (target.name === "dmg") {
        this.effectiveDistOptions = await (<DmgTarget>target).computeDmgOptions()
        break
      }
    }
    // http://madole.xyz/babel-plugin-transform-async-to-module-method-gotcha/
    return await OsXPackager.prototype.pack.call(this, outDir, arch, targets, postAsyncTasks)
  }

  //noinspection JSUnusedLocalSymbols
  async doPack(outDir: string, appOutDir: string, platformName: string, arch: Arch, customBuildOptions: MacOptions, targets: Array<Target>) {
    // skip
  }

  //noinspection JSUnusedGlobalSymbols
  async doSign(opts: MacSignOptions): Promise<any> {
    this.effectiveSignOptions = opts
  }

  //noinspection JSUnusedGlobalSymbols,JSUnusedLocalSymbols
  async doFlat(appPath: string, outFile: string, identity: string, keychain?: string | null): Promise<any> {
    // skip
  }

  //noinspection JSUnusedGlobalSymbols,JSUnusedLocalSymbols
  packageInDistributableFormat(appOutDir: string, arch: Arch, targets: Array<Target>, promises: Array<Promise<any>>): void {
    // skip
  }

  protected async writeUpdateInfo(appOutDir: string, outDir: string) {
    // ignored
  }
}
