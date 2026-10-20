"use strict"

const { ElectronBuilderForgeMaker, withLegacyForgeCall } = require("app-builder-lib")

class MakerNsis extends ElectronBuilderForgeMaker {
  constructor(...args) {
    super(...args)
    this.name = "nsis"
    this.defaultPlatforms = ["win32"]
  }

  getTarget(targetArch, config) {
    return { win: [`nsis:${targetArch}`], config: { nsis: config } }
  }
}

// module.exports is the maker class itself: Electron Forge 8 import()s this file and constructs the CommonJS module's
// default export, which is module.exports. Forge 6/7 and TypeScript's interop read `.default`.
const Maker = withLegacyForgeCall(MakerNsis)
module.exports = Maker
Object.defineProperty(module.exports, "__esModule", { value: true })
module.exports.default = Maker
module.exports.MakerNsis = Maker
// Electron Forge 5 checked this on the module
module.exports.isSupportedOnCurrentPlatform = () => Promise.resolve(true)
