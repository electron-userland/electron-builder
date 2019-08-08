'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true,
});

const buildForge = require('app-builder-lib').buildForge;
const Target = require('app-builder-lib').Target;
const platform = require('os').platform;

class MakerAppImage extends Target {
  constructor(configFetcher, providedPlatforms) {
    super(configFetcher, providedPlatforms);
    this.name = 'AppImage';
    this.defaultPlatforms = ['linux'];
  }
  isSupportedOnCurrentPlatform() {
    return platform() === 'linux';
  }
  make(options) {
    return buildForge(options, { linux: [`appimage:${options.targetArch}`] });
  }

  get platforms() {
    if (this.providedPlatforms) return this.providedPlatforms;
    return this.defaultPlatforms;
  }

  prepareConfig(targetArch) {
    if (typeof this.configFetcher === 'function') {
      this.config = this.configFetcher(targetArch);
    } else {
      this.config = this.configFetcher;
    }
  }
}
exports.default = MakerAppImage;
