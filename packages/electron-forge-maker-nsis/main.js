import { ElectronBuilderForgeMaker, withLegacyForgeCall } from "app-builder-lib"

class MakerNsis extends ElectronBuilderForgeMaker {
  name = "nsis"
  defaultPlatforms = ["win32"]

  getTarget(targetArch, config) {
    return { win: [`nsis:${targetArch}`], config: { nsis: config } }
  }
}

const Maker = withLegacyForgeCall(MakerNsis)

export { Maker as MakerNsis }
export default Maker

// Electron Forge 5 checked this on the module
export const isSupportedOnCurrentPlatform = () => Promise.resolve(true)
