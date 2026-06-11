import * as path from "path"
import { build } from "./index.js"
import { PackagerOptions } from "./packagerApi.js"

export interface ForgeOptions {
  readonly dir: string
}

export function buildForge(forgeOptions: ForgeOptions, options: PackagerOptions) {
  // Resolve appDir to an absolute canonical path before deriving any sibling
  // directories from it.  Using path.dirname avoids embedding ".." in the
  // resolved path, which keeps downstream path comparisons and CodeQL taint
  // tracking straightforward.
  const appDir = path.resolve(forgeOptions.dir)
  return build({
    prepackaged: appDir,
    config: {
      directories: {
        // https://github.com/electron-userland/electron-forge/blob/master/src/makers/generic/zip.js
        output: path.join(path.dirname(appDir), "make"),
      },
    },
    ...options,
  })
}
