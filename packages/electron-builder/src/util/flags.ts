export function isUseSystemWine() {
  return isEnvTrue(process.env.USE_SYSTEM_WINE)
}

export function isUseSystemSigncode() {
  return isEnvTrue(process.env.USE_SYSTEM_SIGNCODE)
}

export function isBuildCacheEnabled() {
  return !isEnvTrue(process.env.ELECTRON_BUILDER_DISABLE_BUILD_CACHE)
}

export function isAutoDiscoveryCodeSignIdentity() {
  return process.env.CSC_IDENTITY_AUTO_DISCOVERY !== "false"
}

function isEnvTrue(value: string | null | undefined) {
  if (value != null) {
    value = value.trim()
  }
  return value === "true" || value === "" || value === "1"
}