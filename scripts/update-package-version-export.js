const path = require("path")
const { writeFileSync } = require("fs")

const readVersion = pkg => require(path.join(__dirname, "../packages", pkg, "package.json")).version

const destFile = path.join(__dirname, "../packages/app-builder-lib/src/version.ts")

// ELECTRON_UPDATER_VERSION / BUILDER_UTIL_RUNTIME_VERSION are the versions released together with this app-builder-lib:
// the build fails unless the app's electron-updater has the same major (see util/electronUpdaterPairing.ts).
writeFileSync(
  destFile,
  `export const PACKAGE_VERSION = "${readVersion("app-builder-lib")}"
export const ELECTRON_UPDATER_VERSION = "${readVersion("electron-updater")}"
export const BUILDER_UTIL_RUNTIME_VERSION = "${readVersion("builder-util-runtime")}"
`
)
