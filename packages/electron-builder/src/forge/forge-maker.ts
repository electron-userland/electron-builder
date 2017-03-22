import * as path from "path"
import { build, CliOptions } from "../builder"

export function buildForge(appDir: string, options: CliOptions) {
  return build(Object.assign({
    prepackaged: appDir,
    config: {
      directories: {
        // https://github.com/electron-userland/electron-forge/blob/master/src/makers/generic/zip.js
        output: path.resolve(appDir, "..", "make"),
      },
    }
  }, options))
}