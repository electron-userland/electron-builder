"use strict"

const MakerBase = require("@electron-forge/maker-base").default
const buildForge = require("app-builder-lib").buildForge

module.exports = class extends MakerBase {
  name = "appimage"
  defaultPlatforms = ["linux"]

  isSupportedOnCurrentPlatform() {
    return true
  }

  async make(options) {
    return buildForge(options, { linux: [`appimage:${options.targetArch}`], config: this.config })
  }
}
