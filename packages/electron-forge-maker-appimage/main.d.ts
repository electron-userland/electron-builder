import { ElectronBuilderForgeMaker, ForgeMakerTarget, AppImageOptions } from "app-builder-lib"

export declare class MakerAppImage extends ElectronBuilderForgeMaker<AppImageOptions> {
  readonly name: "appimage"
  readonly defaultPlatforms: ["linux"]
  protected getTarget(targetArch: string, config: AppImageOptions | undefined): ForgeMakerTarget
}

export default MakerAppImage

export declare const isSupportedOnCurrentPlatform: () => Promise<boolean>
