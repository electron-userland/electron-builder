"use strict"

const path = require("path")
const MakerBase = require("@electron-forge/maker-base").default
const buildForge = require("app-builder-lib").buildForge

module.exports = class extends MakerBase {
  name = "appimage"
  defaultPlatforms = ["linux"]

  isSupportedOnCurrentPlatform() {
    return true
  }

  async make(options) {
    return buildForge(options, {
      linux: [`appimage:${options.targetArch}`],
      config: {
        directories: {
          output: path.resolve(options.makeDir, "appimage", options.targetArch),
        },
        ...this.config,
      },
    })
  }
}
