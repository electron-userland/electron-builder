"use strict"

const electron = require('electron')
const autoUpdater = require("electron-updater")

const app = electron.app
console.log(`APP_VERSION: ${app.getVersion()}`);

app.on("ready", () => {
  if (process.env.AUTO_UPDATER_TEST) {
    autoUpdater.updateConfigPath = process.env.AUTO_UPDATER_TEST_CONFIG_PATH?.trim();
    autoUpdater.checkForUpdates();
    autoUpdater.on("update-downloaded", () => {
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 1000);
    });
  }
});