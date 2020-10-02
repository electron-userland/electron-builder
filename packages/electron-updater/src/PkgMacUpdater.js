"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PkgMacUpdater = void 0;

function _child_process() {
  const data = require("child_process");

  _child_process = function () {
    return data;
  };

  return data;
}

function _BaseUpdater() {
  const data = require("electron-updater/out/BaseUpdater");

  _BaseUpdater = function () {
    return data;
  };

  return data;
}

function _Provider() {
  const data = require("electron-updater/out/providers/Provider");

  _Provider = function () {
    return data;
  };

  return data;
}

class PkgMacUpdater extends _BaseUpdater().BaseUpdater {
  constructor(options, app) {
    super(options, app);
  }

  doDownloadUpdate(downloadUpdateOptions) {
    const provider = downloadUpdateOptions.updateInfoAndProvider.provider;
    const fileInfo = (0, _Provider().findFile)(provider.resolveFiles(downloadUpdateOptions.updateInfoAndProvider.info), "pkg");

    return this.executeDownload({
      fileExtension: "pkg",
      downloadUpdateOptions,
      fileInfo,
      task: async (destinationFile, downloadOptions) => {
        await this.httpExecutor.download(fileInfo.url, destinationFile, downloadOptions);
      }
    });
  }

  doInstall(options) {
    try {
      _spawn(options.installerPath).catch(e => {
        const errorCode = e.code;

        this._logger.info(`Cannot run installer: error code: ${errorCode}, error message: "${e.message}"`);
        this.dispatchError(e);
      });

      return true;
    } catch (error) {
      reject(error);
    }
  }
}

exports.PkgMacUpdater = PkgMacUpdater;

async function _spawn(pkg) {
  return new Promise((resolve, reject) => {
    try {
      const process = _child_process().spawn('open', [pkg], {
        detached: true,
        stdio: [ 'ignore' ]
      });
      process.on("error", error => {
        reject(error);
      });
      process.unref();

      if (process.pid !== undefined) {
        resolve(true);
      }
    } catch (error) {
      reject(error);
    }
  });
}