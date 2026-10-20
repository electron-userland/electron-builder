import { ElectronBuilderForgeMaker, ForgeMakerTarget, NsisWebOptions } from "app-builder-lib"

export declare class MakerNsisWeb extends ElectronBuilderForgeMaker<NsisWebOptions> {
  readonly name: "nsis-web"
  readonly defaultPlatforms: ["win32"]
  protected getTarget(targetArch: string, config: NsisWebOptions | undefined): ForgeMakerTarget
}

export default MakerNsisWeb

export declare const isSupportedOnCurrentPlatform: () => Promise<boolean>
