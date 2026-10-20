"use strict"

const { ElectronBuilderForgeMaker, withLegacyForgeCall } = require("app-builder-lib")

class MakerNsisWeb extends ElectronBuilderForgeMaker {
  constructor(...args) {
    super(...args)
    this.name = "nsis-web"
    this.defaultPlatforms = ["win32"]
  }

  getTarget(targetArch, config) {
    return { win: [`nsis-web:${targetArch}`], config: { nsisWeb: config } }
  }
}

// module.exports is the maker class itself: Electron Forge 8 import()s this file and constructs the CommonJS module's
// default export, which is module.exports. Forge 6/7 and TypeScript's interop read `.default`.
const Maker = withLegacyForgeCall(MakerNsisWeb)
module.exports = Maker
Object.defineProperty(module.exports, "__esModule", { value: true })
module.exports.default = Maker
module.exports.MakerNsisWeb = Maker
// Electron Forge 5 checked this on the module
module.exports.isSupportedOnCurrentPlatform = () => Promise.resolve(true)
