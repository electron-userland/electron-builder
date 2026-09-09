/**
 * Single source of truth for the v26 → v27 configuration migration.
 *
 * Two consumers read this table and must never drift apart:
 *  - `checkLegacyConfiguration` (this package) — the build-time guard that tells a user who upgraded
 *    without reading the migration guide exactly which key moved where.
 *  - `electron-builder migrate-schema` (the `electron-builder` package) — the opt-in rewriter.
 *
 * The migrator lives in a package that depends on this one, so the table has to live here for both
 * to share it. Keeping the field lists in one place is not cosmetic: `gatekeeperAssess` was moved
 * into `mac.sign` by the migrator while the schema rejected it there, producing configs that failed
 * validation on the next build.
 */

/** macOS signing fields that moved from the platform root into the `sign` (ElectronSignOptions) bag. */
export const MAC_SIGN_FIELDS = [
  "identity",
  "entitlements",
  "entitlementsInherit",
  "entitlementsLoginHelper",
  "provisioningProfile",
  "type",
  "binaries",
  "requirements",
  "hardenedRuntime",
  "strictVerify",
  "preAutoEntitlements",
  "timestamp",
  "additionalArguments",
] as const

/**
 * macOS signing fields that were removed outright rather than moved under `sign`.
 * `@electron/osx-sign` 2.x dropped the `spctl --assess` step, so there is no `sign.gatekeeperAssess`
 * to migrate to — `ElectronSignOptions` omits it and the schema rejects it.
 */
export const MAC_SIGN_REMOVED_FIELDS = ["gatekeeperAssess"] as const

/** Universal-build fields that moved from the platform root into the `universal` bag. */
export const MAC_UNIVERSAL_FIELDS = ["mergeASARs", "singleArchFiles", "x64ArchFiles"] as const

/**
 * Azure Trusted Signing typed fields in v27 (everything else is an extra key → `additionalMetadata`).
 * `type` is included so it is not mistakenly moved to `additionalMetadata` if already present.
 */
export const AZURE_KNOWN_FIELDS = new Set([
  "type",
  "endpoint",
  "codeSigningAccountName",
  "certificateProfileName",
  "publisherName",
  "fileDigest",
  "timestampRfc3161",
  "timestampDigest",
  "additionalMetadata",
])

/** `electronDownload` fields with no equivalent in the v27 `ElectronGetOptions` (@electron/get v5) shape. */
export const ELECTRON_DOWNLOAD_DROPPED = ["cache", "customDir", "customFilename", "strictSSL", "platform", "arch", "version"] as const

/** Platform keys that accept the macOS signing/universal options. */
export const MAC_PLATFORM_KEYS = ["mac", "mas", "masDev"] as const

/** Every platform key that accepted the shared per-platform options in v26. */
export const ALL_PLATFORM_KEYS = ["mac", "mas", "masDev", "win", "linux"] as const

export const BREAKING_CHANGES_URL = "https://www.electron.build/docs/migration/v27-breaking-changes"

export interface LegacyConfigOption {
  /** The removed key itself. */
  readonly key: string
  /** Path to the object holding `key`. Empty = the configuration root. */
  readonly parent?: readonly string[]
  /**
   * When set, `parent` is ignored and one entry is generated per platform key:
   * `"mac"` → mac/mas/masDev, `"all"` → those plus win/linux.
   */
  readonly scope?: "mac" | "all"
  /** The v27 form, or `null` when the option was removed with no replacement. */
  readonly replacement: string | null
  /** True when `electron-builder migrate-schema` rewrites this automatically. */
  readonly autoMigrated: boolean
  readonly severity: "error" | "warn"
  /** Extra sentence appended to the message — inverted polarity, lost behaviour, etc. */
  readonly detail?: string
  /** Anchor within the breaking-changes page. */
  readonly anchor: string
}

const MAC_SIGN_ANCHOR = "macos-signing-macsign"
const ASAR_ANCHOR = "asar-options-asar"
const NATIVE_MODULES_ANCHOR = "native-module-options-nativemodules"
const ELECTRON_GET_ANCHOR = "electrondownload-electronget"
const WIN_SIGN_ANCHOR = "windows-signing-winsign"

export const LEGACY_CONFIG_OPTIONS: readonly LegacyConfigOption[] = [
  // ── Removed outright ──────────────────────────────────────────────────────
  {
    key: "electronCompile",
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: "electron-compile is unmaintained (no release since 2019). Compile your sources with electron-vite, esbuild, or webpack before packaging.",
    anchor: "electroncompile",
  },
  {
    key: "framework",
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: 'Electron is the only supported framework — "electron" was and remains the default. `proton` / `proton-native` and `libui` support was removed.',
    anchor: "framework-nodeversion-launchuiversion",
  },
  {
    key: "nodeVersion",
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: "It only applied to libui-based frameworks and never affected Electron builds.",
    anchor: "framework-nodeversion-launchuiversion",
  },
  {
    key: "launchUiVersion",
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: "It only applied to libui-based frameworks on Windows.",
    anchor: "framework-nodeversion-launchuiversion",
  },
  {
    key: "disableDefaultIgnoredFiles",
    scope: "all",
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: 'To keep a default-excluded file, name it concretely in a `files` glob instead — e.g. `"files": ["**/*", "**/*.obj"]`.',
    anchor: "disabledefaultignoredfiles",
  },
  {
    key: "systemIntegration",
    parent: ["appImage"],
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: "Desktop integration is handled automatically by AppImageLauncher.",
    anchor: "appimagesystemintegration",
  },
  {
    key: "syncDesktopName",
    parent: ["linux"],
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail:
      "The behaviour it gated is now always on: the installed .desktop filename is always derived from `desktopName` (falling back to executableName). " +
      "If you relied on the old filename, set `desktopName` explicitly to control it.",
    anchor: "linuxsyncdesktopname-always-synced",
  },

  // ── Renamed / restructured: native modules ────────────────────────────────
  {
    key: "npmSkipBuildFromSource",
    replacement: "nativeModules.buildDependenciesFromSource",
    autoMigrated: true,
    severity: "error",
    detail: "Note the value is INVERTED — `npmSkipBuildFromSource: true` becomes `nativeModules.buildDependenciesFromSource: false`.",
    anchor: "npmskipbuildfromsource",
  },
  { key: "buildDependenciesFromSource", replacement: "nativeModules.buildDependenciesFromSource", autoMigrated: true, severity: "error", anchor: NATIVE_MODULES_ANCHOR },
  { key: "nodeGypRebuild", replacement: "nativeModules.nodeGypRebuild", autoMigrated: true, severity: "error", anchor: NATIVE_MODULES_ANCHOR },
  { key: "npmRebuild", replacement: "nativeModules.npmRebuild", autoMigrated: true, severity: "error", anchor: NATIVE_MODULES_ANCHOR },
  { key: "nativeRebuilder", replacement: "nativeModules.rebuildMode", autoMigrated: true, severity: "error", anchor: NATIVE_MODULES_ANCHOR },

  // ── Renamed / restructured: asar ──────────────────────────────────────────
  { key: "asarUnpack", scope: "all", replacement: "asar.unpack", autoMigrated: true, severity: "error", anchor: ASAR_ANCHOR },
  { key: "asarUnpack", replacement: "asar.unpack", autoMigrated: true, severity: "error", anchor: ASAR_ANCHOR },
  { key: "asar-unpack", replacement: "asar.unpack", autoMigrated: true, severity: "error", anchor: ASAR_ANCHOR },
  { key: "asar-unpack-dir", replacement: "asar.unpack", autoMigrated: true, severity: "error", anchor: ASAR_ANCHOR },
  { key: "unpackDir", parent: ["asar"], replacement: "asar.unpack", autoMigrated: true, severity: "error", anchor: ASAR_ANCHOR },
  { key: "disableSanityCheckAsar", replacement: "asar.disableSanityCheck", autoMigrated: true, severity: "error", anchor: ASAR_ANCHOR },
  { key: "disableAsarIntegrity", replacement: "asar.disableIntegrity", autoMigrated: true, severity: "error", anchor: ASAR_ANCHOR },

  // ── Renamed / restructured: misc root ─────────────────────────────────────
  { key: "helper-bundle-id", replacement: "mac.helperBundleId", autoMigrated: true, severity: "error", anchor: "buildhelper-bundle-id" },
  {
    key: "noMsi",
    parent: ["squirrelWindows"],
    replacement: "squirrelWindows.msi",
    autoMigrated: true,
    severity: "error",
    detail: "Note the value is INVERTED — `noMsi: true` becomes `msi: false`.",
    anchor: "squirrelwindowsnomsi",
  },
  {
    key: "snap",
    replacement: "snapcraft",
    autoMigrated: true,
    severity: "error",
    detail: 'The new shape needs an explicit `base` with per-base options nested under it, e.g. `{ "snapcraft": { "base": "core22", "core22": { … } } }`.',
    anchor: "snap-snapcraft",
  },

  // ── Renamed / restructured: electronDownload → electronGet ────────────────
  {
    key: "electronDownload",
    replacement: "electronGet",
    autoMigrated: true,
    severity: "error",
    detail: "The shape also changed to match @electron/get v5: `mirror` → `mirrorOptions.mirror`, `isVerifyChecksum: false` → `unsafelyDisableChecksums: true`.",
    anchor: ELECTRON_GET_ANCHOR,
  },
  {
    key: "isVerifyChecksum",
    parent: ["electronGet"],
    replacement: "electronGet.unsafelyDisableChecksums",
    autoMigrated: true,
    severity: "error",
    detail: "Note the value is INVERTED — `isVerifyChecksum: false` becomes `unsafelyDisableChecksums: true`.",
    anchor: ELECTRON_GET_ANCHOR,
  },
  {
    key: "mirror",
    parent: ["electronGet"],
    replacement: "electronGet.mirrorOptions.mirror",
    autoMigrated: true,
    severity: "error",
    anchor: ELECTRON_GET_ANCHOR,
  },
  {
    key: "cache",
    parent: ["electronGet"],
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: "It is intentionally not exposed as a config key — set the `ELECTRON_BUILDER_CACHE` environment variable instead.",
    anchor: ELECTRON_GET_ANCHOR,
  },
  {
    key: "customDir",
    parent: ["electronGet"],
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: "Use `electronDist` to stage a custom Electron build.",
    anchor: ELECTRON_GET_ANCHOR,
  },
  {
    key: "customFilename",
    parent: ["electronGet"],
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: "Use `electronDist` to stage a custom Electron build.",
    anchor: ELECTRON_GET_ANCHOR,
  },
  {
    key: "strictSSL",
    parent: ["electronGet"],
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: "@electron/get v5 downloads via `fetch`, which has no equivalent option.",
    anchor: ELECTRON_GET_ANCHOR,
  },

  // ── Windows signing ───────────────────────────────────────────────────────
  {
    key: "signtoolOptions",
    parent: ["win"],
    replacement: 'win.sign with `type: "signtool"`',
    autoMigrated: true,
    severity: "error",
    detail: "All fields move verbatim; add the `type` discriminator.",
    anchor: WIN_SIGN_ANCHOR,
  },
  {
    key: "azureSignOptions",
    parent: ["win"],
    replacement: 'win.sign with `type: "azure"`',
    autoMigrated: true,
    severity: "error",
    detail: "Fields move verbatim; any extra keys that used the old index signature move into `additionalMetadata`.",
    anchor: WIN_SIGN_ANCHOR,
  },
  {
    key: "signExecutable",
    parent: ["win"],
    replacement: "win.sign: false",
    autoMigrated: true,
    severity: "error",
    detail: "Only the `false` case has an equivalent (it disables signing; resource editing still runs). `signExecutable: true` was the default — delete it.",
    anchor: "winsignexecutable-winsignandeditexecutable-removed",
  },
  {
    key: "signAndEditExecutable",
    parent: ["win"],
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: "Resource editing always runs in v27. To skip signing only, set `win.sign: false`; there is no equivalent that also skips resource editing.",
    anchor: "winsignexecutable-winsignandeditexecutable-removed",
  },

  // ── Programmatic PackagerOptions leaking into the config object ───────────
  {
    key: "devMetadata",
    replacement: null,
    autoMigrated: false,
    severity: "error",
    detail: "Put build configuration at the configuration root instead.",
    anchor: "devmetadata-extrametadata-programmatic-packageroptions",
  },

  // ── macOS signing: one entry per moved field, per platform key ────────────
  ...MAC_SIGN_FIELDS.map(
    (field): LegacyConfigOption => ({
      key: field,
      scope: "mac",
      replacement: `sign.${field}`,
      autoMigrated: true,
      severity: "error",
      anchor: MAC_SIGN_ANCHOR,
    })
  ),
  {
    key: "signIgnore",
    scope: "mac",
    replacement: "sign.ignore",
    autoMigrated: true,
    severity: "error",
    detail: "Renamed to the @electron/osx-sign canonical name.",
    anchor: MAC_SIGN_ANCHOR,
  },
  ...MAC_SIGN_REMOVED_FIELDS.map(
    (field): LegacyConfigOption => ({
      key: field,
      scope: "mac",
      replacement: null,
      autoMigrated: true,
      severity: "error",
      detail: "@electron/osx-sign 2.x removed the `spctl --assess` step entirely, so there is no `sign.gatekeeperAssess` to move it to.",
      anchor: MAC_SIGN_ANCHOR,
    })
  ),
  ...MAC_UNIVERSAL_FIELDS.map(
    (field): LegacyConfigOption => ({
      key: field,
      scope: "mac",
      replacement: `universal.${field}`,
      autoMigrated: true,
      severity: "error",
      anchor: "macuniversal",
    })
  ),
]

/** A `LegacyConfigOption` with its `scope` expanded to a concrete parent path. */
export interface ResolvedLegacyConfigOption extends LegacyConfigOption {
  /** Concrete path of the object holding `key`. */
  readonly parentPath: readonly string[]
  /** Dot-joined `parentPath` + `key`, as it appears in a user's config. */
  readonly fullPath: string
}

function resolve(options: readonly LegacyConfigOption[]): readonly ResolvedLegacyConfigOption[] {
  const resolved: ResolvedLegacyConfigOption[] = []
  for (const option of options) {
    const parents: Array<readonly string[]> =
      option.scope === "mac" ? MAC_PLATFORM_KEYS.map(p => [p]) : option.scope === "all" ? ALL_PLATFORM_KEYS.map(p => [p]) : [option.parent ?? []]
    for (const parentPath of parents) {
      resolved.push({ ...option, parentPath, fullPath: [...parentPath, option.key].join(".") })
    }
  }
  return resolved
}

/** `LEGACY_CONFIG_OPTIONS` with every `scope` expanded into concrete paths. */
export const RESOLVED_LEGACY_CONFIG_OPTIONS: readonly ResolvedLegacyConfigOption[] = resolve(LEGACY_CONFIG_OPTIONS)

/**
 * Renders the user-facing message for a single legacy option.
 *
 * A scoped option's `replacement` is relative to its platform key (`sign.identity`), so it is
 * prefixed with the resolved parent to read as the user wrote it (`mac.sign.identity`).
 */
export function formatLegacyOptionMessage(option: ResolvedLegacyConfigOption): string {
  const lines: string[] = []
  if (option.replacement == null) {
    lines.push(`\`${option.fullPath}\` was removed in electron-builder v27.`)
  } else {
    // A replacement containing a space is prose ("win.sign with `type: \"signtool\"`") — leave it as-is.
    const replacement = option.replacement.includes(" ")
      ? option.replacement
      : `\`${option.scope == null ? option.replacement : [...option.parentPath, option.replacement].join(".")}\``
    lines.push(`\`${option.fullPath}\` was replaced by ${replacement} in electron-builder v27.`)
  }
  if (option.detail != null) {
    lines.push(`  ${option.detail}`)
  }
  if (option.autoMigrated) {
    lines.push("  Run `electron-builder migrate-schema` to update your configuration automatically.")
  }
  lines.push(`  ${BREAKING_CHANGES_URL}#${option.anchor}`)
  return lines.join("\n")
}
