import { ElectronBuilderForgeMaker, ForgeMakerTarget, NsisWebOptions } from "app-builder-lib"

declare class MakerNsisWeb extends ElectronBuilderForgeMaker<NsisWebOptions> {
  readonly name: "nsis-web"
  readonly defaultPlatforms: ["win32"]
  protected getTarget(targetArch: string, config: NsisWebOptions | undefined): ForgeMakerTarget
}

// CommonJS: module.exports is the class, with `default`, `MakerNsisWeb` and `isSupportedOnCurrentPlatform` set on it
declare namespace MakerNsisWeb {
  export { MakerNsisWeb as default, MakerNsisWeb }
  /** Electron Forge 5 checked this on the module */
  export const isSupportedOnCurrentPlatform: () => Promise<boolean>
}

export = MakerNsisWeb
