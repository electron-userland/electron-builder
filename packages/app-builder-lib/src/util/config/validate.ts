import path from "path"
import { Lazy } from "lazy-val"
import { DebugLogger, safeStringifyJson } from "builder-util"
import { PACKAGE_VERSION } from "../../version.js"
import { Configuration } from "../../configuration.js"
import { readJson } from "fs-extra"
import validateSchema from "@develar/schema-utils"

const schemeDataPromise = new Lazy(() => readJson(path.join(__dirname, "..", "..", "..", "scheme.json")))

export async function validateConfiguration(config: Configuration, debugLogger: DebugLogger) {
  validateSchema(await schemeDataPromise.value, config, {
    name: `electron-builder ${PACKAGE_VERSION}`,
    postFormatter: (formattedError: string, error: any): string => {
      if (debugLogger.isEnabled) {
        debugLogger.add("invalidConfig", safeStringifyJson(error))
      }

      const site = "https://www.electron.build"
      let url = `${site}/configuration`
      const targets = new Set(["mac", "dmg", "pkg", "mas", "win", "nsis", "appx", "linux", "appimage", "snap"])
      const dataPath: string = error.dataPath == null ? null : error.dataPath
      const targetPath = dataPath.startsWith(".") ? dataPath.substring(1).toLowerCase() : null
      if (targetPath != null && targets.has(targetPath)) {
        url = `${site}/${targetPath}`
      }

      return `${formattedError}\n  How to fix:
  1. Open ${url}
  2. Search the option name on the page (or type in into Search to find across the docs).
    * Not found? The option may have been deprecated or no longer exists (check spelling).
    * Found? Check that the option in the appropriate place. e.g. "title" only in the "dmg", not in the root.
`
    },
  })
}
