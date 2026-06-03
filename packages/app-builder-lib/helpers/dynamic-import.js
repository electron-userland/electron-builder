const url = require("url")
const fs = require("fs")
const path = require("path")

// Resolve a module specifier to a file:// URL using CJS resolution, which
// adds .js extensions automatically and follows pnpm's symlinked node_modules.
// Returns null for Node built-ins (require.resolve returns a bare string, not
// an absolute path) and for any specifier that cannot be resolved, so callers
// fall back to importing the raw specifier and get the normal error.
function resolveToFileUrl(modulePath) {
  try {
    const resolved = require.resolve(modulePath)
    // Built-in modules (e.g. "fs", "path") resolve to their bare name, not a
    // filesystem path. Passing a bare name to pathToFileURL produces a bogus URL.
    return path.isAbsolute(resolved) ? url.pathToFileURL(resolved).href : null
  } catch {
    return null
  }
}

exports.dynamicImport = async function dynamicImport(modulePath) {
  if (fs.existsSync(modulePath)) {
    return import(url.pathToFileURL(modulePath).href)
  }
  const fileUrl = resolveToFileUrl(modulePath)
  return import(fileUrl !== null ? fileUrl : modulePath)
}

exports.dynamicImportMaybe = async function dynamicImportMaybe(modulePath) {
  try {
    return require(modulePath)
  } catch (e1) {
    try {
      return await exports.dynamicImport(modulePath)
    } catch (e2) {
      e1.message = "\n1. " + e1.message + "\n2. " + e2.message
      throw e1
    }
  }
}
