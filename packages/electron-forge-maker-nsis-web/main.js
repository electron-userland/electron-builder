import { ElectronBuilderForgeMaker, withLegacyForgeCall } from "app-builder-lib"

class MakerNsisWeb extends ElectronBuilderForgeMaker {
  name = "nsis-web"
  defaultPlatforms = ["win32"]

  getTarget(targetArch, config) {
    return { win: [`nsis-web:${targetArch}`], config: { nsisWeb: config } }
  }
}

const Maker = withLegacyForgeCall(MakerNsisWeb)

export { Maker as MakerNsisWeb }
export default Maker

// Electron Forge 5 checked this on the module
export const isSupportedOnCurrentPlatform = () => Promise.resolve(true)
