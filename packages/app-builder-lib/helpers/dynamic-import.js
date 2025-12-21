const url = require("url")
const fs = require("fs")

exports.dynamicImport = async function dynamicImport(path) {
  try {
    return await import(fs.existsSync(path) ? url.pathToFileURL(path).href : path)
  } catch (error) {
    return Promise.reject(error)
  }
}

exports.dynamicImportMaybe = async function dynamicImportMaybe(path) {
  try {
    return require(path)
  } catch (e1) {
    try {
      return await exports.dynamicImport(path)
    } catch (e2) {
      e1.message = "\n1. " + e1.message + "\n2. " + e2.message
      throw e1
    }
  }
}
