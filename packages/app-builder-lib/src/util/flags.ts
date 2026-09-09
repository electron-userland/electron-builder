import { InvalidConfigurationError, isEnvTrue } from "builder-util"

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

// ─── Removed environment variables (v26 → v27) ───────────────────────────────

interface RemovedEnvVar {
  /** How to achieve the same thing in v27. */
  readonly replacement: string
  /** What the variable used to control, so the user can tell whether they still need it. */
  readonly controlled: string
}

/**
 * Environment variables that v26 honored and v27 ignores.
 *
 * These are the most silent of all the v27 breaking changes: unlike a removed config key, nothing
 * validates `process.env`, so a CI image exporting `USE_SYSTEM_WINE` or `ELECTRON_BUILDER_NSIS_DIR`
 * silently switches toolchain with a green build. `CI_BUILD_TAG` is worse still — combined with the
 * removal of implicit publishing, a tagged release simply stops uploading.
 *
 * Toolsets are now configured through the `toolsets` build option, which accepts an `https://` URL
 * (downloaded and cached) or a `file://` path (used as-is).
 */
const REMOVED_ENV_VARS: Record<string, RemovedEnvVar> = {
  APPIMAGE_TOOLS_PATH: {
    controlled: "the AppImage build tools (mksquashfs, runtime)",
    replacement: 'toolsets.appimage: { url: "file:///path/to/appimage-tools-dir" }',
  },
  LINUX_TOOLS_MAC_PATH: {
    controlled: "the linux-tools-mac bundle (ar, lzip, gtar) used when building Linux targets on macOS",
    replacement: 'toolsets.linuxToolsMac: { url: "file:///path/to/linux-tools-mac-dir" }',
  },
  CUSTOM_FPM_PATH: {
    controlled: "the FPM executable",
    replacement: 'toolsets.fpm: { url: "file:///path/to/fpm-dir" }',
  },
  USE_SYSTEM_FPM: {
    controlled: "forcing the host-installed fpm instead of the bundled one",
    replacement: 'toolsets.fpm: { url: "file:///path/to/fpm-dir" }',
  },
  ELECTRON_BUILDER_NSIS_DIR: {
    controlled: "the NSIS compiler bundle directory",
    replacement: 'toolsets.nsis: { url: "file:///path/to/nsis-bundle-dir" }',
  },
  ELECTRON_BUILDER_NSIS_RESOURCES_DIR: {
    controlled: "the NSIS resources/plugins directory",
    replacement: 'toolsets.nsis: { url: "file:///path/to/nsis-bundle-dir" } (the v27 nsis bundle carries compiler and resources together)',
  },
  ELECTRON_BUILDER_WINE_TOOLSET_DIR: {
    controlled: "the Wine bundle directory",
    replacement: 'toolsets.wine: { url: "file:///path/to/wine-dir" }',
  },
  USE_SYSTEM_WINE: {
    controlled: "forcing the host-installed Wine instead of the downloaded bundle",
    replacement: 'toolsets.wine: { url: "file:///path/to/wine-dir" } (on Linux the host `wine` is already the default, so you can simply drop this variable)',
  },
  USE_SYSTEM_SIGNCODE: {
    controlled: "forcing the host signtool/signcode instead of the bundled winCodeSign toolset",
    replacement: 'win.sign (e.g. { "win": { "sign": { "type": "signtool", … } } }) together with toolsets.winCodeSign: { url: "file:///path/to/bundle-dir" }',
  },
  USE_SYSTEM_OSSLSIGNCODE: {
    controlled: "forcing the host osslsigncode instead of the bundled one",
    replacement: 'win.sign together with toolsets.winCodeSign: { url: "file:///path/to/bundle-dir" }',
  },
  SIGNTOOL_PATH: {
    controlled: "the path to signtool.exe",
    replacement: 'toolsets.winCodeSign: { url: "file:///path/to/bundle-dir" }',
  },
  ELECTRON_BUILDER_7ZIP_PATH: {
    controlled: "the 7-Zip executable",
    replacement: 'toolsets.sevenZip: { url: "file:///path/to/dir" } (a custom sevenZip bundle must be a .tar.gz, .zip, or bare file:// directory)',
  },
  ELECTRON_BUILDER_ICONS_TOOLSET_DIR: {
    controlled: "the icons toolset bundle directory",
    replacement: 'toolsets.icons: { url: "file:///path/to/icons-bundle-dir" }',
  },
  CI_BUILD_TAG: {
    controlled: "the release tag used by the publisher",
    replacement: "the CI_COMMIT_TAG environment variable (the standard GitLab CI variable)",
  },
  ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY: {
    controlled: "bundling electron-builder itself when it was listed under production dependencies",
    replacement: 'the ignoredProductionDependencies build option — drop "electron-builder" from the list to ship it inside your app',
  },
}

/** Emitted once per process; a build can invoke the packager more than once. */
let removedEnvVarsChecked = false

/**
 * Fails the build when a removed environment variable is set, naming the `toolsets` (or other)
 * replacement. Without this the variable is simply ignored and the build silently uses a different
 * toolchain than the one CI asked for.
 *
 * @internal exported for tests
 */
export function checkRemovedEnvVars(env: NodeJS.ProcessEnv = process.env): string | null {
  const found = Object.keys(REMOVED_ENV_VARS)
    .filter(name => env[name] != null && env[name] !== "")
    .sort()
  if (found.length === 0) {
    return null
  }

  const header =
    found.length === 1
      ? `The environment variable ${found[0]} was removed in electron-builder v27 and is now ignored:`
      : `${found.length} environment variables set here were removed in electron-builder v27 and are now ignored:`
  const entries = found.map(name => {
    const { controlled, replacement } = REMOVED_ENV_VARS[name]
    return `• ${name} controlled ${controlled}.\n  Use ${replacement} instead.`
  })
  return [
    header,
    "",
    ...entries,
    "",
    "Unset the variable once you have moved the setting into your configuration.",
    "https://www.electron.build/docs/migration/v27-breaking-changes#toolset-env-var-overrides-removed",
  ].join("\n")
}

/**
 * Throws when a removed environment variable is set. Called once per process from `Packager.build()`
 * so it runs for every entrypoint (CLI, programmatic `build()`, and a directly constructed Packager).
 */
export function assertNoRemovedEnvVars(): void {
  if (removedEnvVarsChecked) {
    return
  }
  removedEnvVarsChecked = true
  const message = checkRemovedEnvVars()
  if (message != null) {
    throw new InvalidConfigurationError(message)
  }
}

/** @internal exported for tests — lets a test re-arm the once-per-process guard. */
export function resetRemovedEnvVarsCheck(): void {
  removedEnvVarsChecked = false
}
