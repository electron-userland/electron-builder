"use strict"

const electron = require("electron")
const { autoUpdater } = require("electron-updater")
const path = require("path")

const app = electron.app

process.on("uncaughtException", console.error)
process.on("unhandledRejection", console.error)

console.log(`APP_VERSION: ${app.getVersion()}`)

const updateConfigPath = process.env.AUTO_UPDATER_TEST_CONFIG_PATH?.trim()
const shouldTestAutoUpdater = !!process.env.AUTO_UPDATER_TEST?.trim() && !!updateConfigPath
const root = path.dirname(process.execPath)
const _appUpdateConfigPath = path.resolve(process.platform === "darwin" ? `${root}/../Resources` : `${root}/resources`, "app-update.yml")

console.log(`Should test autoupdate: ${shouldTestAutoUpdater}`)
console.log(`Autoupdate config path: ${updateConfigPath}`)
console.log(`App app-update.yml configuration: ${_appUpdateConfigPath}`)

async function init() {
  if (!app.isReady()) {
    await app.whenReady()
  }
  isReady()
}

function isReady() {
  console.log(`APP_VERSION: ${app.getVersion()}`)

  if (shouldTestAutoUpdater) {
    autoUpdater._appUpdateConfigPath = _appUpdateConfigPath
    autoUpdater.updateConfigPath = updateConfigPath
    autoUpdater.logger = console
    autoUpdater.autoDownload = true

    autoUpdater.checkForUpdates()
    autoUpdater.on("checking-for-update", () => {
      console.log("Checking for update...")
    })
    autoUpdater.on("update-available", () => {
      console.log("Update available")
    })
    autoUpdater.on("update-downloaded", () => {
      autoUpdater.quitAndInstall(true, false) // must be false, do not auto-restart app as the unit tests will lose stdout piping/access
    })
    autoUpdater.on("update-not-available", () => {
      console.log("Update not available")
      app.quit()
    })
    autoUpdater.on("error", error => {
      console.error("Error in auto-updater:", error)
      app.quit()
    })
  }
}

init()
  .then(() => {
    console.log("App initialized")
  })
  .catch(error => {
    console.error("Error initializing app:", error)
  })
