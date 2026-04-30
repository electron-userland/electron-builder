import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { existsSync } from "node:fs"

const require = createRequire(import.meta.url)

export async function dynamicImport(path) {
  try {
    return await import(existsSync(path) ? pathToFileURL(path).href : path)
  } catch (error) {
    return Promise.reject(error)
  }
}

/** Like {@link dynamicImport()}, except it tries out {@link require()} first. */
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
