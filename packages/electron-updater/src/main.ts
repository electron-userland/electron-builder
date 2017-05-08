// autoUpdater to mimic electron bundled autoUpdater
import { AppUpdater } from "./AppUpdater"
export { NET_SESSION_NAME } from "./electronHttpExecutor"

let impl
if (process.platform === "win32") {
  impl = new (require("./NsisUpdater").NsisUpdater)()
}
else if (process.platform === "darwin") {
  impl = new (require("./MacUpdater").MacUpdater)()
}
else {
  impl = require("electron").autoUpdater
}
export const autoUpdater: AppUpdater = impl