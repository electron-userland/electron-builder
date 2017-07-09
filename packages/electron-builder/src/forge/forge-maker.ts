import * as path from "path"
import { build, CliOptions } from "../builder"

export interface ForgeOptions {
  readonly dir: string
}

export function buildForge(forgeOptions: ForgeOptions, options: CliOptions) {
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