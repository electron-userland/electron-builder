"use strict"

const electron = require("electron")
const path = require("path")
const fs = require("fs")
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

// Install-on-next-launch test modes. Env values are strings — compare with === "true"
// so that e.g. "false" (a truthy string) does not enable a mode.
const isNextLaunchQueueMode = process.env.AUTO_UPDATER_TEST_NEXT_LAUNCH === "true"
const isAutoInstallOnNextLaunchMode = process.env.AUTO_UPDATER_TEST_AUTO_INSTALL_ON_NEXT_LAUNCH === "true"
const isInstallPendingMode = process.env.AUTO_UPDATER_TEST_INSTALL_PENDING === "true"

// Custom update-file verification (AppUpdater.verifyUpdateFile). Unset = no hook installed (default stub).
// "accept" / "reject" install a hook that logs what it was handed and then succeeds or fails.
const verifyUpdateFileMode = process.env.AUTO_UPDATER_TEST_VERIFY_UPDATE_FILE?.trim()

// Updater knobs of the blackbox cases, written by fixtureEnv() in test/src/updater/blackboxFixtureEnv.ts. Unset, each one keeps the
// configuration below. A bad value throws here, and the launch logs INVALID_FIXTURE_KNOB and quits (see isReady): a throw out of
// isReady would end in init().catch, which does not quit, and leave the launch hanging until the harness times out.
function readUpdaterKnobs() {
  const read = name => process.env[`AUTO_UPDATER_TEST_${name}`] || null
  const oneOf = (name, values) => {
    const value = read(name)
    if (value != null && !values.includes(value)) {
      throw new Error(`AUTO_UPDATER_TEST_${name} is ${JSON.stringify(value)}, not one of ${values.join(", ")}`)
    }
    return value
  }
  const requestHeaders = read("REQUEST_HEADERS")
  const pendingOnlyQuitAfterMs = read("PENDING_ONLY_QUIT_AFTER_MS")
  if (pendingOnlyQuitAfterMs != null && !/^[1-9][0-9]*$/.test(pendingOnlyQuitAfterMs)) {
    throw new Error(`AUTO_UPDATER_TEST_PENDING_ONLY_QUIT_AFTER_MS is ${JSON.stringify(pendingOnlyQuitAfterMs)}, not a number of milliseconds`)
  }
  return {
    // "unset" leaves autoUpdater.crossOriginHeaders null: the update check fails with ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED
    unsetCrossOriginHeaders: oneOf("CROSS_ORIGIN_HEADERS", ["unset"]) != null,
    requestHeaders: requestHeaders == null ? null : parseRequestHeaders(requestHeaders),
    authHeader: read("AUTH_HEADER"),
    // "false" changes nothing: it overrides the "true" that the harness passes for a served feed that is not loopback (insecureFeedEnv)
    allowInsecureFeed: oneOf("ALLOW_INSECURE_FEED", ["true", "false"]) === "true",
    publisherName: read("PUBLISHER_NAME"),
    // "accept": a verifyUpdateFileAuthenticodeSignature that accepts every update, e.g. one signed with the untrusted test certificate
    authenticodeStub: oneOf("AUTHENTICODE_STUB", ["accept"]) != null,
    autoInstallEvent: oneOf("AUTO_INSTALL_EVENT", ["onQuit", "onNextLaunch", "manual"]),
    // no update check: the launch only runs the install at launch of a pending update, and quits after this many milliseconds otherwise
    pendingOnlyQuitAfterMs: pendingOnlyQuitAfterMs == null ? null : Number(pendingOnlyQuitAfterMs),
    debugLog: oneOf("DEBUG_LOG", ["true"]) != null,
  }
}

function parseRequestHeaders(json) {
  let headers = null
  try {
    headers = JSON.parse(json)
  } catch {
    // not JSON: reported below
  }
  // a plain object (not null, an array, a string or a number) of strings
  if (Object.prototype.toString.call(headers) !== "[object Object]" || Object.values(headers).some(value => typeof value !== "string")) {
    throw new Error(`AUTO_UPDATER_TEST_REQUEST_HEADERS is ${JSON.stringify(json)}, not a JSON object of strings`)
  }
  return headers
}

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
    let knobs
    try {
      knobs = readUpdaterKnobs()
    } catch (error) {
      console.log(`INVALID_FIXTURE_KNOB: ${error.message}`)
      app.quit()
      return
    }

    const { autoUpdater } = require("electron-updater")

    // autoUpdater._appUpdateConfigPath = _appUpdateConfigPath
    autoUpdater.updateConfigPath = updateConfigPath
    autoUpdater.logger = {
      info: (...args) => console.log("[updater]", ...args),
      warn: (...args) => console.log("[updater warn]", ...args),
      error: (...args) => console.log("[updater error]", ...args),
      debug: knobs.debugLog ? (...args) => console.log("[updater debug]", ...args) : () => {},
    }
    autoUpdater.autoRunAppAfterInstall = false
    // required; set it before the pending-install check at launch, for the same reason as autoInstallEvent below
    if (!knobs.unsetCrossOriginHeaders) {
      autoUpdater.crossOriginHeaders = () => []
    }
    // Must be assigned synchronously after require: BaseUpdater schedules the automatic
    // pending-install check on app.whenReady(), which has already resolved at this point.
    autoUpdater.autoInstallEvent = knobs.autoInstallEvent ?? (isAutoInstallOnNextLaunchMode ? "onNextLaunch" : "onQuit")
    // the other knobs too, for the same reason: the install at launch sends requests and verifies the pending update
    if (knobs.requestHeaders != null) {
      autoUpdater.requestHeaders = knobs.requestHeaders
    }
    if (knobs.authHeader != null) {
      autoUpdater.addAuthHeader(knobs.authHeader)
    }
    if (knobs.allowInsecureFeed) {
      autoUpdater.allowInsecureFeed = true
    }
    if (knobs.publisherName != null) {
      autoUpdater.publisherName = knobs.publisherName
    }
    if (knobs.authenticodeStub) {
      autoUpdater.verifyUpdateFileAuthenticodeSignature = async publisherNames => {
        console.log(`AUTHENTICODE_STUB_CALLED: ${JSON.stringify({ publisherNames })}`)
        return { response: "success" }
      }
    }

    // Assigned in the same synchronous block as autoInstallEvent, and for the same reason: the automatic
    // pending-install check is scheduled on app.whenReady(), which has already resolved here, so the hook
    // must be in place before control returns to the event loop.
    if (verifyUpdateFileMode) {
      autoUpdater.verifyUpdateFile = async ({ updateFilePath, originalUpdateFileName, packageFilePath }) => {
        // A fresh download is handed the file under a temporary name; a cached or pending update is
        // re-verified under its real name.
        const observation = {
          mode: verifyUpdateFileMode,
          temporary: path.basename(updateFilePath) !== originalUpdateFileName,
          name: path.basename(updateFilePath),
          original: originalUpdateFileName,
          exists: fs.existsSync(updateFilePath),
          executable: fs.existsSync(updateFilePath) && (fs.statSync(updateFilePath).mode & 0o111) !== 0,
          package: packageFilePath ?? null,
        }
        console.log(`VERIFY_UPDATE_FILE_CALLED: ${JSON.stringify(observation)}`)
        return verifyUpdateFileMode === "reject" ? { response: "failure", message: "blackbox verifyUpdateFile rejection" } : { response: "success" }
      }
    }

    autoUpdater.on("checking-for-update", () => {
      console.log("Checking for update...")
    })
    autoUpdater.on("update-available", () => {
      console.log("Update available")
    })
    autoUpdater.on("update-downloaded", () => {
      console.log("Update downloaded, starting quitAndInstall")
      // isForceRunAfter must be false, do not auto-restart app as the unit tests will lose stdout piping/access.
      // waitUntilNextLaunch queues the pending install and quits instead of running the installer.
      autoUpdater.quitAndInstall({ isSilent: true, isForceRunAfter: false, waitUntilNextLaunch: isNextLaunchQueueMode })
    })
    autoUpdater.on("update-not-available", () => {
      console.log("Update not available")
      app.quit()
    })
    autoUpdater.on("error", error => {
      console.log("Error in auto-updater:", error)
      app.quit()
    })

    if (isInstallPendingMode) {
      // Explicit startup install — the only pending-install path for deb/rpm/pacman (their install elevates).
      const isInstalled = await autoUpdater.installPendingUpdateIfAvailable()
      console.log(`INSTALL_PENDING_RESULT: ${isInstalled}`)
      if (!isInstalled) {
        app.quit()
      }
      // when a pending update was installed, the updater quits the app itself
    } else if (isAutoInstallOnNextLaunchMode || knobs.pendingOnlyQuitAfterMs != null) {
      // The updater installs the pending update at startup on its own (autoInstallEvent: "onNextLaunch", or
      // any but "manual" for an update queued with waitUntilNextLaunch).
      // Fallback quit so a skipped or failed automatic install cannot hang the test harness.
      setTimeout(() => {
        console.log("AUTO_INSTALL_ON_NEXT_LAUNCH_TIMEOUT: automatic install did not quit the app")
        app.quit()
      }, knobs.pendingOnlyQuitAfterMs ?? 90 * 1000)
    } else {
      autoUpdater.checkForUpdates().catch(err => {
        console.log("checkForUpdates rejected (handled via error event):", err?.message)
      })
    }
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
