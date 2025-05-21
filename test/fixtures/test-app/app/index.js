"use strict"

const electron = require('electron')
const autoUpdater = require("electron-updater")

const app = electron.app
console.log(`APP_VERSION: ${app.getVersion()}`);

app.on("ready", () => {
  const updateConfigPath = process.env.AUTO_UPDATER_TEST_CONFIG_PATH?.trim();
  const shouldTestAutoUpdater = process.env.AUTO_UPDATER_TEST;
  console.log(`AUTO_UPDATER_TEST: ${shouldTestAutoUpdater}`);
  console.log(`AUTO_UPDATER_TEST_CONFIG_PATH: ${updateConfigPath}`);

  if (shouldTestAutoUpdater) {
    autoUpdater.updateConfigPath = updateConfigPath;
    autoUpdater.checkForUpdates();
    autoUpdater.on("update-downloaded", () => {
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 1000);
    });
  }
});