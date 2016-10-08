import { NsisUpdater } from "./NsisUpdater"

// autoUpdater to mimic electron bundled autoUpdater
export const autoUpdater = process.platform === "win32" ? new (require("./NsisUpdater").NsisUpdater)() : require("electron").autoUpdater