import { pathToFileURL } from "url"
import { existsSync } from "fs"

export async function dynamicImport(path) {
  try {
    return await import(existsSync(path) ? pathToFileURL(path).href : path)
  } catch (error) {
    return Promise.reject(error)
  }
}

export async function dynamicImportMaybe(path) {
  try {
    return require(path)
  } catch (e1) {
    try {
      return await dynamicImport(path)
    } catch (e2) {
      e1.message = "\n1. " + e1.message + "\n2. " + e2.message
      throw e1
    }
  }
}
