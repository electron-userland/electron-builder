// Runs before anything else is loaded, so an unsupported Node version produces a named error instead
// of whatever the ESM/require(esm) machinery happens to throw first (typically ERR_REQUIRE_ESM or a
// syntax error deep in a dependency, neither of which mentions electron-builder or the required
// version). Deliberately dependency-free and kept in plain ES2015 so it parses on old runtimes.
//
// This file must never be imported by electron-updater: that runs inside Electron's bundled Node,
// which is frequently below this floor, and where the module graph has already been resolved.

const MINIMUM = "22.12.0"

function parse(version) {
  return version
    .replace(/^v/, "")
    .split("-")[0]
    .split(".")
    .map(part => Number.parseInt(part, 10) || 0)
}

export function assertNodeVersion(actual = process.versions.node) {
  const current = parse(actual)
  const required = parse(MINIMUM)
  for (let i = 0; i < required.length; i++) {
    if (current[i] > required[i]) {
      return
    }
    if (current[i] < required[i]) {
      throw new Error(
        `electron-builder requires Node.js >= ${MINIMUM}, but this process is running Node.js ${actual}.\n\n` +
          `v27 ships as native ES modules. Node ${MINIMUM} is the first release where require(esm) is\n` +
          `stable without a flag, which is what lets both CJS and ESM projects consume these packages.\n\n` +
          `Upgrade the Node.js version used by your shell, your CI job, and any Docker image that runs\n` +
          `electron-builder, then try again.\n` +
          `https://www.electron.build/docs/migration/v27-breaking-changes#nodejs-22120-required`
      )
    }
  }
}

export default assertNodeVersion
