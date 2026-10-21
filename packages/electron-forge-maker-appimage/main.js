import { ElectronBuilderForgeMaker, withLegacyForgeCall } from "app-builder-lib"

class MakerAppImage extends ElectronBuilderForgeMaker {
  name = "appimage"
  defaultPlatforms = ["linux"]

  getTarget(targetArch, config) {
    return { linux: [`appimage:${targetArch}`], config: { appImage: config } }
  }
}

const Maker = withLegacyForgeCall(MakerAppImage)

export { Maker as MakerAppImage }
export default Maker

// Electron Forge 5 checked this on the module
export const isSupportedOnCurrentPlatform = () => Promise.resolve(true)
