'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true,
});

const buildForge = require('app-builder-lib').buildForge;
const MakerBase = require('@electron-forge/maker-base').default;
const platform = require('os').platform;

class MakerAppImage extends MakerBase {
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
}
exports.default = MakerAppImage;
