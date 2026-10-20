import { ElectronBuilderForgeMaker, ForgeMakerTarget, SnapcraftOptions } from "app-builder-lib"

export declare class MakerSnap extends ElectronBuilderForgeMaker<SnapcraftOptions> {
  readonly name: "snap"
  readonly defaultPlatforms: ["linux"]
  protected getTarget(targetArch: string, config: SnapcraftOptions | undefined): ForgeMakerTarget
}

export default MakerSnap

export declare const isSupportedOnCurrentPlatform: () => Promise<boolean>
