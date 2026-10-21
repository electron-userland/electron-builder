import { log } from "builder-util"

interface RemovedEnvVar {
  /** The environment variable that was read in v26 but is no longer read in v27. */
  readonly name: string
  /** What to use instead, appended to the deprecation warning. */
  readonly remediation: string
}

/**
 * Environment variables that were honored in electron-builder v26 but were removed in v27. When a
 * project upgrades from v26 and still has one of these set, the build silently ignores it — the
 * `process.env` read was deleted, so there is no other signal. {@link warnOnRemovedEnvVars} scans
 * the environment once per build and logs a deprecation warning with the remediation.
 *
 * Deliberately excluded: internal/test-only variables that end users never set (`JEST_WORKER_ID`,
 * `TEST_SET_BABEL_PRESET`), and `npm_lifecycle_event` (npm sets it for every script, so presence is
 * not a signal — the removed `"release"` auto-publish behavior is covered in the migration docs).
 */
export const REMOVED_ENV_VARS: ReadonlyArray<RemovedEnvVar> = [
  // Toolset path/dir overrides — the `resolveEnvToolsetPath` mechanism was removed; supply a ToolsetCustom object instead.
  { name: "APPIMAGE_TOOLS_PATH", remediation: `set \`toolsets.appimage: { url: "file:///path/to/dir" }\` instead.` },
  { name: "MKSQUASHFS_PATH", remediation: `the mksquashfs binary now ships with the appimage toolset — set \`toolsets.appimage: { url: "file:///path/to/dir" }\` to override it.` },
  { name: "LINUX_TOOLS_MAC_PATH", remediation: `set \`toolsets.linuxToolsMac: { url: "file:///path/to/dir" }\` instead.` },
  { name: "CUSTOM_FPM_PATH", remediation: `set \`toolsets.fpm: { url: "file:///path/to/dir" }\` instead.` },
  { name: "ELECTRON_BUILDER_NSIS_DIR", remediation: `set \`toolsets.nsis: { url: "file:///path/to/dir" }\` instead.` },
  { name: "ELECTRON_BUILDER_NSIS_RESOURCES_DIR", remediation: `set \`toolsets.nsis: { url: "file:///path/to/dir" }\` instead.` },
  { name: "CUSTOM_NSIS_RESOURCES", remediation: `set \`toolsets.nsis: { url: "file:///path/to/dir" }\` instead.` },
  { name: "ELECTRON_BUILDER_WINE_TOOLSET_DIR", remediation: `set \`toolsets.wine: { url: "file:///path/to/dir" }\` instead.` },
  { name: "ELECTRON_BUILDER_7ZIP_PATH", remediation: `set \`toolsets.sevenZip: { url: "file:///path/to/dir" }\` instead.` },
  { name: "ELECTRON_BUILDER_ICONS_TOOLSET_DIR", remediation: `set \`toolsets.icons: { url: "file:///path/to/dir" }\` instead.` },
  { name: "ELECTRON_BUILDER_OSSL_SIGNCODE_PATH", remediation: `set \`toolsets.winCodeSign: { url: "file:///path/to/dir" }\` instead.` },
  { name: "ELECTRON_BUILDER_RCEDIT_PATH", remediation: `set \`toolsets.winCodeSign: { url: "file:///path/to/dir" }\` instead.` },
  { name: "ELECTRON_BUILDER_WINDOWS_KITS_PATH", remediation: `set \`toolsets.winCodeSign: { url: "file:///path/to/dir" }\` instead.` },
  { name: "SIGNTOOL_PATH", remediation: `configure signing via \`win.sign\` and the \`winCodeSign\` toolset instead.` },

  // `USE_SYSTEM_*` toggles — removed with no env-var replacement; configure via the toolset/signing config.
  { name: "USE_SYSTEM_WINE", remediation: `Linux uses the host \`wine\` by default; to use a custom Wine build set \`toolsets.wine: { url: "file:///path/to/dir" }\`.` },
  { name: "USE_SYSTEM_SIGNCODE", remediation: `configure signing via \`win.sign\` and the \`winCodeSign\` toolset instead.` },
  { name: "USE_SYSTEM_OSSLSIGNCODE", remediation: `configure signing via \`win.sign\` and the \`winCodeSign\` toolset instead.` },
  { name: "USE_SYSTEM_FPM", remediation: `set \`toolsets.fpm: { url: "file:///path/to/dir" }\` instead (required on Windows for FPM-based targets).` },

  // Renamed / replaced by another environment variable.
  { name: "ELECTRON_BUILDER_BINARIES_ALLOW_HTTP", remediation: `use \`ELECTRON_BUILDER_DANGEROUSLY_ALLOW_HTTP=true\` instead.` },
  { name: "CI_BUILD_TAG", remediation: `use \`CI_COMMIT_TAG\` (the standard GitLab CI variable) instead.` },

  // Replaced by a configuration option (with a behavior change).
  {
    name: "ALLOW_ELECTRON_BUILDER_AS_PRODUCTION_DEPENDENCY",
    remediation: `electron-builder in \`dependencies\` no longer errors and is excluded from the packaged app by default — remove this variable, and use the \`ignoredProductionDependencies\` option to customize exclusions.`,
  },
]

/**
 * Logs a one-time deprecation warning for every {@link REMOVED_ENV_VARS} entry still present in the
 * environment. Called once per build (from the {@link Packager} constructor) so both the CLI and the
 * programmatic `build()` API surface the same guidance.
 */
export function warnOnRemovedEnvVars(env: NodeJS.ProcessEnv = process.env): void {
  for (const { name, remediation } of REMOVED_ENV_VARS) {
    if (env[name] != null) {
      log.warn({ envVar: name }, `environment variable was removed in electron-builder v27 and no longer has any effect — ${remediation}`)
    }
  }
}
