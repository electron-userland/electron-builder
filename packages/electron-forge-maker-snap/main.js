import { ElectronBuilderForgeMaker, withLegacyForgeCall } from "app-builder-lib"

class MakerSnap extends ElectronBuilderForgeMaker {
  name = "snap"
  defaultPlatforms = ["linux"]

  getTarget(targetArch, config) {
    return { linux: [`snap:${targetArch}`], config: { snapcraft: config } }
  }
}

const Maker = withLegacyForgeCall(MakerSnap)

export { Maker as MakerSnap }
export default Maker

// Electron Forge 5 checked this on the module
export const isSupportedOnCurrentPlatform = () => Promise.resolve(true)
