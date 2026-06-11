"use strict"

const electron = require("electron")
const path = require("path")
const sqlite3 = require("sqlite3").verbose() // injected during blackboxUpdateTest

const app = electron.app
const BrowserWindow = electron.BrowserWindow

let mainWindow

process.on("uncaughtException", err => console.log("uncaughtException:", err))
process.on("unhandledRejection", err => console.log("unhandledRejection:", err))

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

  if (!shouldTestAutoUpdater) {
    // Probe mode: version already printed; quit without creating any windows
    app.quit()
    return
  }

  // No window in auto-update mode — renderer crashes in headless VMs (no GPU/display)
  // trigger window-all-closed → app.quit() mid-download. electron-updater runs
  // entirely in the main process and needs no visible window.

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
    autoUpdater.logger = {
      info: (...args) => console.log("[updater]", ...args),
      warn: (...args) => console.log("[updater warn]", ...args),
      error: (...args) => console.log("[updater error]", ...args),
      debug: () => {},
    }
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
      console.log("Error in auto-updater:", error)
      app.quit()
    })
    autoUpdater.checkForUpdates().catch(err => {
      console.log("checkForUpdates rejected (handled via error event):", err?.message)
    })
  } else {
    // Not in auto-update test mode — quit immediately after printing version so polling probes are cheap
    app.quit()
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
  if (!shouldTestAutoUpdater) {
    app.quit()
  }
  // In auto-update mode the updater runs headlessly — a renderer crash must not abort it.
})

init()
  .then(() => {
    console.log("App initialized")
  })
  .catch(error => {
    console.log("Error initializing app:", error)
  })
