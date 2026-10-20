import { ElectronBuilderForgeMaker, ForgeMakerTarget, NsisOptions } from "app-builder-lib"

declare class MakerNsis extends ElectronBuilderForgeMaker<NsisOptions> {
  readonly name: "nsis"
  readonly defaultPlatforms: ["win32"]
  protected getTarget(targetArch: string, config: NsisOptions | undefined): ForgeMakerTarget
}

// CommonJS: module.exports is the class, with `default`, `MakerNsis` and `isSupportedOnCurrentPlatform` set on it
declare namespace MakerNsis {
  export { MakerNsis as default, MakerNsis }
  /** Electron Forge 5 checked this on the module */
  export const isSupportedOnCurrentPlatform: () => Promise<boolean>
}

export = MakerNsis
