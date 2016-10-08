import { NsisUpdater } from "./nsis-updater"

if (process.platform === "win32") {
  module.exports = require("electron").autoUpdater
}
else {
  const updater: NsisUpdater = new (require("./nsis-updater").NsisUpdater)()

  module.exports = updater
}