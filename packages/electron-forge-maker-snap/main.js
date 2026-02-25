"use strict"

const path = require("path")
const MakerBase = require("@electron-forge/maker-base").default
const buildForge = require("app-builder-lib").buildForge

module.exports = class extends MakerBase {
  name = "snap"
  defaultPlatforms = ["linux"]

  isSupportedOnCurrentPlatform() {
    return true
  }

  async make(options) {
    return buildForge(options, {
      linux: [`snap:${options.targetArch}`],
      config: {
        directories: {
          output: path.resolve(options.makeDir, "snap", options.targetArch)
        },
        ...this.config
      }
    })
  }
}
