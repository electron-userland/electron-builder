import { ElectronBuilderForgeMaker, ForgeMakerTarget, NsisOptions } from "app-builder-lib"

export declare class MakerNsis extends ElectronBuilderForgeMaker<NsisOptions> {
  readonly name: "nsis"
  readonly defaultPlatforms: ["win32"]
  protected getTarget(targetArch: string, config: NsisOptions | undefined): ForgeMakerTarget
}

export default MakerNsis

export declare const isSupportedOnCurrentPlatform: () => Promise<boolean>
