"use strict"

const path = require("path")
const MakerBase = require("@electron-forge/maker-base").default
const buildForge = require("app-builder-lib").buildForge

module.exports = class extends MakerBase {
  name = "nsis-web"
  defaultPlatforms = ["win32"]

  isSupportedOnCurrentPlatform() {
    return true
  }

  async make(options) {
    return buildForge(options, {
      win: [`nsis-web:${options.targetArch}`],
      config: {
        directories: {
          output: path.resolve(options.makeDir, "nsis-web", options.targetArch),
        },
        ...this.config,
      },
    })
  }
}
