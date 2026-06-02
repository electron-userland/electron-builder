const url = require("url")
const fs = require("fs")

// Resolve a module specifier to a file:// URL using CJS resolution, which
// adds .js extensions automatically and follows pnpm's symlinked node_modules.
// Falls back to the raw specifier if require.resolve() cannot find the path
// (e.g. the module isn't installed yet — caller will get the normal error).
function resolveToFileUrl(modulePath) {
  try {
    return url.pathToFileURL(require.resolve(modulePath)).href
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
