import * as path from "path"
import { build } from "./index"
import { PackagerOptions } from "./packagerApi"

export interface ForgeOptions {
  readonly dir: string
}

export function buildForge(forgeOptions: ForgeOptions, options: PackagerOptions) {
  const appDir = forgeOptions.dir
  return build({
    prepackaged: appDir,
    config: {
      directories: {
        // https://github.com/electron-userland/electron-forge/blob/master/src/makers/generic/zip.js
        output: path.resolve(appDir, "..", "make"),
      },
    },
    ...options
  })
}