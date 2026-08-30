import { Arch, InvalidConfigurationError, isEmptyOrSpaces, log } from "builder-util"
import * as semver from "semver"
import { Configuration } from "../configuration.js"
import { Platform } from "../core.js"

/**
 * Electron 44 removed Windows ia32 and Linux armv7l builds (https://github.com/electron/electron/pull/51816).
 * The removal applies to the entire 44 line: it was backported to the 44-x-y branch during the alpha phase,
 * so the first releases without the artifacts are v44.0.0-alpha.4 and v45.0.0-nightly.20260714. The
 * 44.0.0-alpha.1–3 artifacts that did ship are not a supported combination going forward, which is why the
 * check is on the semver major (a plain `semver.gte(version, "44.0.0")` would let 44.0.0-alpha.x through).
 */
const FIRST_ELECTRON_MAJOR_WITHOUT_32BIT = 44

function isArchRemovedFromElectron(platform: Platform, arch: Arch): boolean {
  return (platform === Platform.WINDOWS && arch === Arch.ia32) || (platform === Platform.LINUX && arch === Arch.armv7l)
}

// Mirror env vars honoured by @electron/get (see mirrorVar in @electron/get's artifact-utils).
const ELECTRON_MIRROR_ENV_VARS = ["NPM_CONFIG_ELECTRON_MIRROR", "npm_config_electron_mirror", "npm_package_config_electron_mirror", "ELECTRON_MIRROR"] as const

/**
 * True when the build does not download the official Electron distribution: a custom `electronDist`
 * (path or hook), custom `electronGet.mirrorOptions`, or an @electron/get mirror env var is configured.
 * In that case the user may provide their own 32-bit builds, so the arch guard only warns.
 */
function hasCustomElectronDistribution(config: Configuration): boolean {
  const electronDist = config.electronDist
  if (electronDist != null && (typeof electronDist !== "string" || !isEmptyOrSpaces(electronDist))) {
    return true
  }
  if (config.electronGet?.mirrorOptions != null) {
    return true
  }
  return ELECTRON_MIRROR_ENV_VARS.some(name => !isEmptyOrSpaces(process.env[name]))
}

/**
 * Fails fast with a clear configuration error when the requested platform+arch combination has no official
 * Electron build anymore (instead of an opaque 404 at download time). Downgraded to a warning when a custom
 * Electron distribution or mirror is configured, since it may still provide 32-bit builds.
 *
 * Exported for unit testing; called from the Packager before packing each arch.
 */
export function assertElectronArchSupported(platform: Platform, arch: Arch, electronVersion: string, config: Configuration): void {
  if (!isArchRemovedFromElectron(platform, arch)) {
    return
  }
  // don't second-guess unparseable versions (e.g. custom forks) — the download step will produce its own error
  const coerced = semver.coerce(electronVersion)
  if (coerced == null || semver.major(coerced) < FIRST_ELECTRON_MAJOR_WITHOUT_32BIT) {
    return
  }

  const archName = Arch[arch]
  const message =
    `Electron ${electronVersion} does not provide ${platform.name} ${archName} builds — ` +
    `Electron 44 removed Windows ia32 and Linux armv7l support (https://github.com/electron/electron/pull/51816). ` +
    `Use electronVersion <= 43.x to keep building for ${archName} (32-bit is supported until the v43 series reaches end-of-life in January 2027), or drop the ${archName} target.`

  if (hasCustomElectronDistribution(config)) {
    log.warn(
      { platform: platform.name, arch: archName, electronVersion },
      `${message} Proceeding anyway because a custom electronDist or Electron mirror is configured — ensure it actually provides a ${platform.name} ${archName} build.`
    )
    return
  }
  throw new InvalidConfigurationError(message)
}
