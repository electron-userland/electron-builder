import { ElectronBuilderForgeMaker, ForgeMakerTarget, AppImageOptions } from "app-builder-lib"

declare class MakerAppImage extends ElectronBuilderForgeMaker<AppImageOptions> {
  readonly name: "appimage"
  readonly defaultPlatforms: ["linux"]
  protected getTarget(targetArch: string, config: AppImageOptions | undefined): ForgeMakerTarget
}

// CommonJS: module.exports is the class, with `default`, `MakerAppImage` and `isSupportedOnCurrentPlatform` set on it
declare namespace MakerAppImage {
  export { MakerAppImage as default, MakerAppImage }
  /** Electron Forge 5 checked this on the module */
  export const isSupportedOnCurrentPlatform: () => Promise<boolean>
}

export = MakerAppImage
