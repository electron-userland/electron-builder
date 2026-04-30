import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

/** @internal */
export function start() {
  require("electron-webpack/dev-runner")
  return Promise.resolve()
}
