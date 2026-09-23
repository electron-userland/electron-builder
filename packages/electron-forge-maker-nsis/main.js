import { buildForge } from "app-builder-lib"

export const isSupportedOnCurrentPlatform = () => Promise.resolve(true)

export default function (options) {
  return buildForge(options, { win: [`nsis:${options.targetArch}`] })
}
