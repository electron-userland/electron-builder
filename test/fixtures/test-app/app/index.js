"use strict"

const electron = require("electron")
const path = require("path")
const sqlite3 = require("sqlite3").verbose() // injected during blackboxUpdateTest

const app = electron.app
const BrowserWindow = electron.BrowserWindow

let mainWindow

process.on("uncaughtException", console.error)
process.on("unhandledRejection", console.error)

console.log(`APP_VERSION: ${app.getVersion()}`)
console.log('Running from:', app.getAppPath())
console.log(`Process.execPath: ${process.execPath}`)
console.log(`Process.argv: ${process.argv}`)

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
  await isReady()
}

async function isReady() {
  console.log(`APP_VERSION: ${app.getVersion()}`)

  createWindow()

  // test native module loading
  const db = new sqlite3.Database(":memory:")
  db.serialize(() => {
    db.run("CREATE TABLE lorem (info TEXT)")

    const stmt = db.prepare("INSERT INTO lorem VALUES (?)")
    for (let i = 0; i < 3; i++) {
      stmt.run("Ipsum " + i)
    }
    stmt.finalize()

    db.each("SELECT rowid AS id, info FROM lorem", (err, row) => {
      console.log(row.id + ": " + row.info)
    })
  })

  db.close()

  if (shouldTestAutoUpdater) {
    const { autoUpdater } = require("electron-updater")

    // autoUpdater._appUpdateConfigPath = _appUpdateConfigPath
    autoUpdater.updateConfigPath = updateConfigPath
    autoUpdater.logger = console
    autoUpdater.autoRunAppAfterInstall = false

    autoUpdater.on("checking-for-update", () => {
      console.log("Checking for update...")
    })
    autoUpdater.on("update-available", () => {
      console.log("Update available")
    })
    autoUpdater.on("update-downloaded", () => {
      console.log("Update downloaded, starting quitAndInstall")
      autoUpdater.quitAndInstall(true, false) // must be false, do not auto-restart app as the unit tests will lose stdout piping/access
      // autoUpdater.autoInstallOnAppQuit = true
      // app.quit()
    })
    autoUpdater.on("update-not-available", () => {
      console.log("Update not available")
      app.quit()
    })
    autoUpdater.on("error", error => {
      console.error("Error in auto-updater:", error)
      app.quit()
    })
    autoUpdater.checkForUpdates()
  }
}

function createWindow() {
  let remote;
  try {
    remote = require('@electron/remote/main')
  } catch (error) {
    console.error(error)
  }
  remote?.initialize()
  mainWindow = new BrowserWindow({
    width: 800, height: 600, webPreferences: {
      nodeIntegration: true, contextIsolation: false, enableRemoteModule: true
    }
  })
  remote?.enable(mainWindow.webContents)

  mainWindow.loadURL('file://' + __dirname + '/index.html')

  mainWindow.webContents.openDevTools()

  mainWindow.on('closed', function () {
    mainWindow = null
  });
}

app.on('window-all-closed', function () {
  app.quit()
})

init()
  .then(() => {
    console.log("App initialized")
  })
  .catch(error => {
    console.error("Error initializing app:", error)
  })
