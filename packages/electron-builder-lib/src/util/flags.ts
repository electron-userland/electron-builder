import { isEnvTrue } from "builder-util"

export function isUseSystemSigncode() {
  return isEnvTrue(process.env.USE_SYSTEM_SIGNCODE)
}

export function isBuildCacheEnabled() {
  return !isEnvTrue(process.env.ELECTRON_BUILDER_DISABLE_BUILD_CACHE)
}

export function isAutoDiscoveryCodeSignIdentity() {
  return process.env.CSC_IDENTITY_AUTO_DISCOVERY !== "false"
}