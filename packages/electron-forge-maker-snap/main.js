"use strict"

const { ElectronBuilderForgeMaker, withLegacyForgeCall } = require("app-builder-lib")

class MakerSnap extends ElectronBuilderForgeMaker {
  constructor(...args) {
    super(...args)
    this.name = "snap"
    this.defaultPlatforms = ["linux"]
  }

  getTarget(targetArch, config) {
    return { linux: [`snap:${targetArch}`], config: { snapcraft: config } }
  }
}

// module.exports is the maker class itself: Electron Forge 8 import()s this file and constructs the CommonJS module's
// default export, which is module.exports. Forge 6/7 and TypeScript's interop read `.default`.
const Maker = withLegacyForgeCall(MakerSnap)
module.exports = Maker
Object.defineProperty(module.exports, "__esModule", { value: true })
module.exports.default = Maker
module.exports.MakerSnap = Maker
// Electron Forge 5 checked this on the module
module.exports.isSupportedOnCurrentPlatform = () => Promise.resolve(true)
