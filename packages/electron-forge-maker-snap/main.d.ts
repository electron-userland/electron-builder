import { ElectronBuilderForgeMaker, ForgeMakerTarget, SnapcraftOptions } from "app-builder-lib"

declare class MakerSnap extends ElectronBuilderForgeMaker<SnapcraftOptions> {
  readonly name: "snap"
  readonly defaultPlatforms: ["linux"]
  protected getTarget(targetArch: string, config: SnapcraftOptions | undefined): ForgeMakerTarget
}

// CommonJS: module.exports is the class, with `default`, `MakerSnap` and `isSupportedOnCurrentPlatform` set on it
declare namespace MakerSnap {
  export { MakerSnap as default, MakerSnap }
  /** Electron Forge 5 checked this on the module */
  export const isSupportedOnCurrentPlatform: () => Promise<boolean>
}

export = MakerSnap
