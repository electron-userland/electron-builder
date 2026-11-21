"use strict"
// Preloaded (`node --require`) by blackboxHarnessTest.ts to run the test app fixture (test/fixtures/test-app/app/index.js) under plain
// node: stands in for electron, sqlite3 and electron-updater, and prints `FIXTURE_UPDATER: <json>`, what the fixture configured on
// autoUpdater at the moment the install at launch of electron-updater reads it: one tick after app.whenReady(), from the require of
// electron-updater on (see the constructor of BaseUpdater). The fixture quitting prints FIXTURE_QUIT.
const Module = require("module")

const listeners = new Map()
const autoUpdater = {
  checkedForUpdates: false,
  quitAndInstallOptions: null,
  on(event, listener) {
    listeners.set(event, listener)
    return autoUpdater
  },
  addAuthHeader(token) {
    autoUpdater.requestHeaders = { ...autoUpdater.requestHeaders, authorization: token }
  },
  checkForUpdates() {
    autoUpdater.checkedForUpdates = true
    return new Promise(() => {})
  },
  quitAndInstall(options) {
    autoUpdater.quitAndInstallOptions = options
  },
}

async function printUpdater() {
  const { crossOriginHeaders, verifyUpdateFileAuthenticodeSignature: verify } = autoUpdater
  listeners.get("update-downloaded")?.()
  // a function is reported by what it returns
  const updater = {
    crossOriginHeaders: typeof crossOriginHeaders === "function" ? crossOriginHeaders(["authorization", "x-tenant"]) : (crossOriginHeaders ?? null),
    requestHeaders: autoUpdater.requestHeaders ?? null,
    allowInsecureFeed: autoUpdater.allowInsecureFeed ?? null,
    publisherName: autoUpdater.publisherName ?? null,
    autoInstallEvent: autoUpdater.autoInstallEvent ?? null,
    authenticodeStub: typeof verify === "function" ? await verify(["CN=Stub"], "TestApp Setup.exe") : null,
    checkedForUpdates: autoUpdater.checkedForUpdates,
    waitUntilNextLaunch: autoUpdater.quitAndInstallOptions?.waitUntilNextLaunch ?? null,
  }
  console.log(`FIXTURE_UPDATER: ${JSON.stringify(updater)}`)
  autoUpdater.logger.debug("stub debug line")
}

class Database {
  serialize(fn) {
    fn()
  }
  run() {}
  prepare() {
    return { run() {}, finalize() {} }
  }
  each() {}
  close() {}
}

const stubs = {
  electron: {
    app: {
      isReady: () => true,
      whenReady: () => Promise.resolve(),
      getVersion: () => "1.0.0",
      getAppPath: () => __dirname,
      on() {},
      quit: () => console.log("FIXTURE_QUIT"),
    },
    BrowserWindow: class {},
  },
  sqlite3: { verbose: () => ({ Database }) },
  "electron-updater": {
    get autoUpdater() {
      void Promise.resolve()
        .then(() => new Promise(resolve => setImmediate(resolve)))
        .then(printUpdater)
      return autoUpdater
    },
  },
}

const load = Module._load
Module._load = function (request, ...rest) {
  return Object.hasOwn(stubs, request) ? stubs[request] : load.call(this, request, ...rest)
}
