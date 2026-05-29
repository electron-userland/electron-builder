import * as path from "path"
import { InvalidConfigurationError } from "builder-util"
import { build } from "./index"
import { PackagerOptions } from "./packagerApi"

export interface ForgeOptions {
  readonly dir: string
}

export function buildForge(forgeOptions: ForgeOptions, options: PackagerOptions) {
  const appDir = forgeOptions.dir
  if (/[\0\r\n"'`$;&|<>]/.test(appDir)) {
    throw new InvalidConfigurationError(`forge directory contains unsafe characters: ${appDir}`)
  }
  return build({
    prepackaged: appDir,
    config: {
      directories: {
        // https://github.com/electron-userland/electron-forge/blob/master/src/makers/generic/zip.js
        output: path.resolve(appDir, "..", "make"),
      },
    },
    ...options,
  })
}
