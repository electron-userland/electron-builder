import { isEnvTrue } from "builder-util"

// ─── Code signing ─────────────────────────────────────────────────────────────

export function isAutoDiscoveryCodeSignIdentity() {
  return process.env.CSC_IDENTITY_AUTO_DISCOVERY !== "false"
}

export function isCscForPullRequest() {
  return isEnvTrue(process.env.CSC_FOR_PULL_REQUEST)
}

// ─── Build behaviour ──────────────────────────────────────────────────────────

export function isBuildCacheEnabled() {
  return !isEnvTrue(process.env.ELECTRON_BUILDER_DISABLE_BUILD_CACHE)
}

export function isRemoveStageDirEvenIfDebug() {
  return isEnvTrue(process.env.ELECTRON_BUILDER_REMOVE_STAGE_EVEN_IF_DEBUG)
}

export function isOfflineModeEnabled() {
  return isEnvTrue(process.env.ELECTRON_BUILDER_OFFLINE)
}

// ─── Publishing ───────────────────────────────────────────────────────────────

export function isPublishForPullRequest() {
  return isEnvTrue(process.env.PUBLISH_FOR_PULL_REQUEST)
}

// ─── Package metadata / dependencies ─────────────────────────────────────────

export function isElectronBuilderAllowedAsProductionDependency() {
  return isEnvTrue(process.env.ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY)
}

export function isNpmNoBinLinks() {
  return isEnvTrue(process.env.NPM_NO_BIN_LINKS)
}

// ─── CI environment detection ─────────────────────────────────────────────────

export function isTravis() {
  return isEnvTrue(process.env.TRAVIS)
}

// ─── Platform toolset overrides ───────────────────────────────────────────────

export function isFpmDebug() {
  return isEnvTrue(process.env.FPM_DEBUG)
}

export function isSnapDestructiveMode() {
  return isEnvTrue(process.env.SNAP_DESTRUCTIVE_MODE)
}
