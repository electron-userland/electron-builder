"use strict"

const { ElectronBuilderForgeMaker, withLegacyForgeCall } = require("app-builder-lib")

class MakerAppImage extends ElectronBuilderForgeMaker {
  constructor(...args) {
    super(...args)
    this.name = "appimage"
    this.defaultPlatforms = ["linux"]
  }

  getTarget(targetArch, config) {
    return { linux: [`appimage:${targetArch}`], config: { appImage: config } }
  }
}

// module.exports is the maker class itself: Electron Forge 8 import()s this file and constructs the CommonJS module's
// default export, which is module.exports. Forge 6/7 and TypeScript's interop read `.default`.
const Maker = withLegacyForgeCall(MakerAppImage)
module.exports = Maker
Object.defineProperty(module.exports, "__esModule", { value: true })
module.exports.default = Maker
module.exports.MakerAppImage = Maker
// Electron Forge 5 checked this on the module
module.exports.isSupportedOnCurrentPlatform = () => Promise.resolve(true)
