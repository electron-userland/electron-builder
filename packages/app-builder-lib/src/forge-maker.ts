import * as path from "path"
<<<<<<< HEAD
<<<<<<< HEAD
import { build } from "./index.js"
import { PackagerOptions } from "./packagerApi.js"
=======
import { build } from "./index.js.js"
import { PackagerOptions } from "./packagerApi.js.js"
>>>>>>> 5a5d2b7d9 (tmp save for .js extension migration)
=======
import { build } from "./index.js"
import { PackagerOptions } from "./packagerApi.js"
>>>>>>> c92b22265 (tmp save for .js extension migration)

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
