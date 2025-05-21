"use strict"

const electron = require("electron")
const { autoUpdater } = require("electron-updater")
const path = require("path")

const app = electron.app

process.on("uncaughtException", console.error)
process.on("unhandledRejection", console.error)

console.log(`APP_VERSION: ${app.getVersion()}`)

const updateConfigPath = process.env.AUTO_UPDATER_TEST_CONFIG_PATH?.trim()
const shouldTestAutoUpdater = process.env.AUTO_UPDATER_TEST
const root = path.dirname(process.execPath)
const _appUpdateConfigPath = path.resolve(process.platform === "darwin" ? `${root}/../Resources` : `${root}/resources`, "app-update.yml")

console.log(`Should test autoupdate: ${shouldTestAutoUpdater}`)
console.log(`Autoupdate config path: ${updateConfigPath}`)
console.log(`App app-update.yml configuration: ${_appUpdateConfigPath}`)

async function init() {
  if (!app.isReady()) {
    await app.whenReady()
  }
  console.log("APP_VERSION:", app.getVersion())
  isReady()
}
init()

function isReady() {
  console.log("App is ready")
  if (!!shouldTestAutoUpdater) {
    autoUpdater._appUpdateConfigPath = _appUpdateConfigPath
    autoUpdater.updateConfigPath = updateConfigPath
    autoUpdater.checkForUpdates()
    autoUpdater.on("update-downloaded", () => {
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 1000)
    })
  }
}
