export { BlockMap, BlockMapFile } from "./blockMapApi.js"
export { hashSensitiveValue, safeStringifyJson } from "./httpExecutor.js"
export type { SnapStoreOptions } from "./publishOptions.js"
export { LogLimiter } from "./logLimiter.js"

// the Electron versions whose native MSIX autoUpdater installs an update electron-updater downloaded (electron/electron#49230 and its
// ComPtr fix #49645); evaluate with semver's `{ includePrerelease: true }`
export const MSIX_UPDATER_ELECTRON_VERSION_RANGE = ">=39.5.2 <40.0.0-0 || >=40.2.1 <41.0.0-0 || >=41.0.0-alpha.6"
