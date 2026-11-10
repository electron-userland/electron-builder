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
export const ELECTRON_DOWNLOAD_DROPPED = ["cache", "customDir", "customFilename", "strictSSL", "platform", "arch", "version", "force"] as const

/** The installer options `msiWrapped` inherited without ever applying them: the wrapped NSIS installer takes them from `nsis.*`. */
export const MSI_WRAPPED_REMOVED_FIELDS = ["oneClick", "perMachine", "runAfterFinish", "createDesktopShortcut", "createStartMenuShortcut", "menuCategory", "shortcutName"] as const

/** What `msiWrapped.oneClick: false` still did, for the guard detail and both migrators. */
export const MSI_WRAPPED_ONE_CLICK_WARNING =
  "`msiWrapped.oneClick: false` only added `-ext WixUIExtension` to light.exe; if an `msiProjectCreated` hook adds WixUI dialogs to the wrapper, " +
  'set `msiWrapped.additionalLightArgs: ["-ext", "WixUIExtension"]`.'

/** Helper bundle ids removed in v27: Electron 4 and later ship no `Helper EH` / `Helper NP` app. */
export const MAC_HELPER_REMOVED_FIELDS = ["helperEHBundleId", "helperNPBundleId"] as const

const MAS_USES_MAC = "Mac App Store builds never read it there: every macOS build, the Mac App Store app included, uses the `mac` value (or the root one)."
const MAS_NO_UPDATE_INFO = "Mac App Store builds write no update information; the `mac` and root values apply to the macOS app."
const MAS_CERTIFICATES =
  "Mac App Store builds never read it there: the certificates of every macOS build come from the `mac` options or the `CSC_LINK` / `CSC_INSTALLER_LINK` environment variables (and their passwords)."

/**
 * The `mac` options that `mas` / `masDev` no longer accept, with where a Mac App Store build takes the value from. Shared by the guard and
 * both migrators, which delete them: moving them to `mac` would change the macOS build.
 */
export const MAS_REMOVED_FIELDS: Readonly<Record<string, string>> = {
  target: "Mac App Store builds never read it there: list `mas` / `mas-dev` in `mac.target` or on the command line (`--mac mas`).",
  icon: MAS_USES_MAC,
  executableName: MAS_USES_MAC,
  electronLanguages: MAS_USES_MAC,
  fileAssociations: MAS_USES_MAC,
  protocols: MAS_USES_MAC,
  compression: MAS_USES_MAC,
  defaultArch: MAS_USES_MAC,
  darkModeSupport: "Mac App Store builds never read it there: `mac.darkModeSupport` applies to every macOS build, the Mac App Store app included.",
  extraDistFiles: "Mac App Store builds never read it: it adds files to the macOS `zip` / `7z` archives, which take it from `mac.extraDistFiles`.",
  notarize: "Mac App Store apps are not notarized; `mac.notarize` applies to the macOS app and the pkg installer.",
  cscLink: MAS_CERTIFICATES,
  cscKeyPassword: MAS_CERTIFICATES,
  cscInstallerLink: MAS_CERTIFICATES,
  cscInstallerKeyPassword: MAS_CERTIFICATES,
  publish: "Mac App Store builds never read it there: the Mac App Store .pkg is published with `mac.publish` (or the root `publish`).",
  releaseInfo: MAS_NO_UPDATE_INFO,
  detectUpdateChannel: MAS_NO_UPDATE_INFO,
  generateUpdatesFilesForAllChannels: MAS_NO_UPDATE_INFO,
  electronUpdaterCompatibility: MAS_NO_UPDATE_INFO,
  updateManifest: MAS_NO_UPDATE_INFO,
}

/** Certificate options among {@link MAS_REMOVED_FIELDS}: the migrators warn when they remove one. */
export const MAS_REMOVED_CERTIFICATE_FIELDS = ["cscLink", "cscKeyPassword", "cscInstallerLink", "cscInstallerKeyPassword"] as const

/** What the migrators tell a user whose `mas` / `masDev` sets a certificate option. */
export const MAS_CERTIFICATE_WARNING =
  "Mac App Store builds never read certificates from mas / masDev: they import the certificates of mac.cscLink / mac.cscInstallerLink " +
  "or the CSC_LINK / CSC_INSTALLER_LINK environment variables (and their passwords). If the Mac App Store app or installer needs the removed certificate, set it there."

/**
 * The fields electron-builder writes into `app-update.yml` itself, removed from the publish options in v27, with the setting that decides
 * each (null: derived from the package name). Shared by the guard, both migrators and the `app-update.yml` writer.
 */
export const PUBLISH_MANAGED_OPTIONS = {
  publisherName: "win.sign.publisherName",
  verifyUpdateCodeSignature: "win.verifyUpdateCodeSignature",
  updateManifestPublicKey: "updateManifest.publicKey",
  updaterCacheDirName: null,
} as const

/** Anchor of the managed publish options within the config-changes page. */
export const PUBLISH_MANAGED_OPTIONS_ANCHOR = "publish-options-managed-by-electron-builder"

/** The per-base `snapcraft` keys typed `SnapOptionsLegacy` / `SnapOptions24`. */
export const SNAP_CORE_KEYS = ["core18", "core20", "core22", "core24"] as const

/** Target options the per-base snap options accepted without reading them: only `snapcraft.publish` / `snapcraft.artifactName` are read. */
export const SNAP_CORE_TARGET_OPTION_KEYS = ["publish", "artifactName"] as const

/** Linux target options that were accepted but never read, with why. Shared by the guard and both migrators, which delete them. */
export const LINUX_UNREAD_TARGET_OPTIONS: ReadonlyArray<{ readonly parent: readonly string[]; readonly key: string; readonly detail: string }> = [
  ...["deb", "rpm", "pacman", "freebsd", "p5p", "apk"].map(target => ({
    parent: [target],
    key: "icon",
    detail: "Linux icons come from `linux.icon`, then `mac.icon` or the root `icon`.",
  })),
  ...["freebsd", "p5p", "apk"].map(target => ({
    parent: [target],
    key: "compression",
    detail: "fpm has no compression option for this package type; only deb, rpm and pacman pass one.",
  })),
  ...[["appImage"], ["flatpak"], ...SNAP_CORE_KEYS.map(core => ["snapcraft", core])].map(parent => ({
    parent,
    key: "synopsis",
    detail: "Only the fpm-built packages (deb, rpm, pacman, freebsd, p5p, apk) read `synopsis`; a snap uses `summary`.",
  })),
]

/** Platform keys that accept the macOS signing/universal options. */
export const MAC_PLATFORM_KEYS = ["mac", "mas", "masDev"] as const

/** Config sections typed as `CommonNsisOptions`, which accepted `customNsisBinary` / `customNsisResources` in v26. */
export const NSIS_CONFIG_KEYS = ["nsis", "nsisWeb", "portable"] as const

/** Every platform key that accepted the shared per-platform options in v26. */
export const ALL_PLATFORM_KEYS = ["mac", "mas", "masDev", "win", "linux"] as const

/** Overview of the v27 breaking changes. Each change is documented on one of the category pages below. */
export const BREAKING_CHANGES_URL = "https://www.electron.build/docs/migration/v27-breaking-changes"
export const CONFIG_CHANGES_URL = "https://www.electron.build/docs/migration/v27-config-changes"
export const BUILD_CHANGES_URL = "https://www.electron.build/docs/migration/v27-build-changes"
export const RUNTIME_CHANGES_URL = "https://www.electron.build/docs/migration/v27-runtime-changes"
export const DEVELOPER_CHANGES_URL = "https://www.electron.build/docs/migration/v27-developer-changes"

/**
 * File-copy options nested under `fileOptions`, at the configuration root and on every platform key
 * (`files` → `fileOptions.files`, `mac.extraResources` → `mac.fileOptions.extraResources`, …).
 *
 * Unlike the options in {@link LEGACY_CONFIG_OPTIONS}, flat keys are not rejected: they are normalized into
 * `fileOptions` with a warning when the configuration is loaded, before validation, although the types and the
 * schema only have `fileOptions`.
 */
export const FILE_OPTION_KEYS = ["files", "extraResources", "extraFiles"] as const

/** Anchor of the `fileOptions` entry within the config-changes page. */
export const FILE_OPTIONS_ANCHOR = "file-options-fileoptions"

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
  /** Anchor within the config-changes page, or within `docsUrl` when set. */
  readonly anchor: string
  /** Page holding `anchor` when it is not the config-changes page. */
  readonly docsUrl?: string
}

const MAC_SIGN_ANCHOR = "macos-signing-macsign"
const ASAR_ANCHOR = "asar-options-asar"
const NATIVE_MODULES_ANCHOR = "native-module-options-nativemodules"
const ELECTRON_GET_ANCHOR = "electrondownload-electronget"
const WIN_SIGN_ANCHOR = "windows-signing-winsign"
const CUSTOM_NSIS_ANCHOR = "customnsisbinary-and-customnsisresources-replaced-by-toolsetsnsis"
const CSC_ANCHOR = "signing-certificates-csclink"
const TOOLSETS_NSIS_DETAIL =
  "Set a custom NSIS bundle via `toolsets.nsis: { url, checksum, version }`. " +
  "This is not a rename. The artifacts provided by `.customNsisBinary` & `.customNsisResources` have been merged into one toolset. " +
  "To continue using custom NSIS binary/resources in your build see (https://www.electron.build/docs/toolsets#custom-nsis-bundle-layout). " +
  "For a complete migration guide from `.customNsisBinary` & `.customNsisResources` to " +
  "the new `toolsets.nsis` bundle see (https://www.electron.build/docs/migration/v26-to-v27#step-4-custom-nsis-migration-guide)."

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
    detail: 'To keep a default-excluded file, name it concretely in a `fileOptions.files` glob instead — e.g. `"fileOptions": { "files": ["**/*", "**/*.obj"] }`.',
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
  {
    key: "target",
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail:
      "A `target` at the configuration root never selected anything: electron-builder reads only `mac.target`, `win.target` and `linux.target` " +
      "(or the targets passed on the command line), so removing it changes no build. To build the targets it names, set them on their platform key.",
    anchor: "root-level-target",
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
    key: "includePdb",
    replacement: "fileOptions.excludedExts",
    autoMigrated: true,
    severity: "error",
    detail:
      "`.pdb` symbol files are now one of the extensions excluded by default, so the boolean is replaced by the list of excluded extensions. " +
      '`includePdb: true` becomes `"fileOptions": { "excludedExts": ["default", "!pdb"] }` (the default extensions except `pdb`; on the command line, ' +
      "repeat the flag: `-c.fileOptions.excludedExts=default -c.fileOptions.excludedExts=!pdb`, single-quoting the second one in an interactive bash or zsh); " +
      "`includePdb: false` was the default: where it overrides an `includePdb: true` from another layer (an `extends` parent, or the config file for a `-c` / programmatic value), " +
      'set `"fileOptions": { "excludedExts": ["default"] }` in its place (on the command line, `-c.fileOptions.excludedExts=default`), otherwise remove it.',
    anchor: "includepdb-fileoptionsexcludedexts",
  },
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
    key: "customSquirrelVendorDir",
    parent: ["squirrelWindows"],
    replacement: "toolsets.squirrel",
    autoMigrated: false,
    severity: "error",
    detail:
      "The bundle layout differs: a custom `toolsets.squirrel` bundle (a `ToolsetCustom` object) must contain an `electron-winstaller/vendor/` subtree, " +
      "whereas `customSquirrelVendorDir` pointed at the vendor files directly. Remove the key to use the default Squirrel bundle.",
    anchor: "squirrelwindowscustomsquirrelvendordir",
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
  {
    key: "force",
    parent: ["electronGet"],
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: "@electron/get v5 has no equivalent. Clear the cache directory (or point `ELECTRON_BUILDER_CACHE` at a fresh path) to force a re-download.",
    anchor: "electrongetoptionsforce-removed",
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

  // ── Windows installers: options that never had an effect ─────────────────
  ...MSI_WRAPPED_REMOVED_FIELDS.map((key): LegacyConfigOption => ({
    key,
    parent: ["msiWrapped"],
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail:
      `It never had an effect: the MSI wrapper only runs the NSIS installer, which takes it from \`nsis.${key}\`.` +
      (key === "oneClick" ? ` ${MSI_WRAPPED_ONE_CLICK_WARNING}` : ""),
    anchor: "msiwrapped-installer-options-removed",
  })),
  {
    key: "electronUpdaterAware",
    parent: ["msix"],
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail:
      "It never had an effect: no update info is written for MSIX packages, which update through the Microsoft Store or App Installer, not electron-updater. " +
      "`appx.electronUpdaterAware` is unchanged.",
    anchor: "msixelectronupdateraware-removed",
  },

  // ── NSIS: custom bundles moved to toolsets.nsis ───────────────────────────
  ...NSIS_CONFIG_KEYS.flatMap((section): LegacyConfigOption[] => [
    {
      key: "customNsisBinary",
      parent: [section],
      replacement: section === "portable" ? "toolsets.nsis" : `\`toolsets.nsis\` and \`${section}.installerDebugLogging\``,
      autoMigrated: false,
      severity: "error",
      detail:
        `Custom NSIS binaries now come from the \`toolsets.nsis\` bundle. ${TOOLSETS_NSIS_DETAIL} ` +
        (section === "portable"
          ? "Property `debugLogging` never had an effect on portable targets and has no equivalent. "
          : `Property \`debugLogging\` is now \`${section}.installerDebugLogging\` (which needs a log-enabled NSIS bundle). `) +
        `\`electron-builder migrate-schema\` moves \`debugLogging\` but cannot convert \`url\` / \`checksum\` / \`version\`.`,
      anchor: CUSTOM_NSIS_ANCHOR,
    },
    {
      key: "customNsisResources",
      parent: [section],
      replacement: "toolsets.nsis",
      autoMigrated: false,
      severity: "error",
      detail: `Custom NSIS resources now come from the \`toolsets.nsis\` bundle. ${TOOLSETS_NSIS_DETAIL}`,
      anchor: CUSTOM_NSIS_ANCHOR,
    },
  ]),

  // ── Programmatic PackagerOptions leaking into the config object ───────────
  {
    key: "devMetadata",
    replacement: null,
    autoMigrated: false,
    severity: "error",
    detail: "Put build configuration at the configuration root instead.",
    anchor: "devmetadata-extrametadata-programmatic-packageroptions",
    docsUrl: DEVELOPER_CHANGES_URL,
  },

  // ── macOS signing: one entry per moved field, per platform key ────────────
  ...MAC_SIGN_FIELDS.map((field): LegacyConfigOption => ({
    key: field,
    scope: "mac",
    replacement: `sign.${field}`,
    autoMigrated: true,
    severity: "error",
    anchor: MAC_SIGN_ANCHOR,
  })),
  {
    key: "signIgnore",
    scope: "mac",
    replacement: "sign.ignore",
    autoMigrated: true,
    severity: "error",
    detail: "Renamed to the @electron/osx-sign canonical name.",
    anchor: MAC_SIGN_ANCHOR,
  },
  ...MAC_SIGN_REMOVED_FIELDS.map((field): LegacyConfigOption => ({
    key: field,
    scope: "mac",
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: "@electron/osx-sign 2.x removed the `spctl --assess` step entirely, so there is no `sign.gatekeeperAssess` to move it to.",
    anchor: MAC_SIGN_ANCHOR,
  })),
  ...MAC_UNIVERSAL_FIELDS.map((field): LegacyConfigOption => ({
    key: field,
    scope: "mac",
    replacement: `universal.${field}`,
    autoMigrated: true,
    severity: "error",
    anchor: "macuniversal",
  })),

  // ── Snap: the file name and upload target are set on snapcraft itself ───
  ...SNAP_CORE_KEYS.flatMap(core =>
    SNAP_CORE_TARGET_OPTION_KEYS.map((key): LegacyConfigOption => ({
      key,
      parent: ["snapcraft", core],
      replacement: `snapcraft.${key}`,
      autoMigrated: true,
      severity: "error",
      detail: `It was never read: the snap's ${key === "publish" ? "upload target" : "file name"} comes from \`snapcraft.${key}\`, then \`linux.${key}\`, then the root \`${key}\`.`,
      anchor: "snapcraft-base-publish-artifactname",
    }))
  ),

  // ── Linux: target options that never had an effect ──────────────────────
  ...LINUX_UNREAD_TARGET_OPTIONS.map(({ parent, key, detail }): LegacyConfigOption => ({
    key,
    parent,
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: `It never had an effect. ${detail}`,
    anchor: "linux-target-options-without-effect",
  })),

  // ── Signing certificates: set per platform ───────────────────────────────
  {
    key: "cscLink",
    replacement: "`mac.cscLink` and `win.cscLink`",
    autoMigrated: true,
    severity: "error",
    detail:
      "The root value applied to macOS and Windows alike and won over `mac.cscLink`, `win.cscLink` and `WIN_CSC_LINK`. " +
      "Set the certificate per platform (`-c.mac.cscLink` / `-c.win.cscLink` on the command line), or use the `CSC_LINK` / `WIN_CSC_LINK` environment variables.",
    anchor: CSC_ANCHOR,
  },
  {
    key: "cscKeyPassword",
    replacement: "`mac.cscKeyPassword` and `win.cscKeyPassword`",
    autoMigrated: true,
    severity: "error",
    detail:
      "The root value applied to macOS and Windows alike and won over `mac.cscKeyPassword` and `win.cscKeyPassword`. " +
      "Set the password per platform, or use the `CSC_KEY_PASSWORD` / `WIN_CSC_KEY_PASSWORD` environment variables.",
    anchor: CSC_ANCHOR,
  },
  {
    key: "cscLink",
    parent: ["linux"],
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: "It never had an effect: Linux packages are not code-signed. The Snap Store login is `snapcraft.cscLink` or `SNAP_CSC_LINK`.",
    anchor: CSC_ANCHOR,
  },
  {
    key: "cscKeyPassword",
    parent: ["linux"],
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: "It never had an effect: Linux packages are not code-signed.",
    anchor: CSC_ANCHOR,
  },

  // ── macOS: helpers Electron no longer ships, and options Mac App Store builds never read ──
  ...MAC_HELPER_REMOVED_FIELDS.map((field): LegacyConfigOption => ({
    key: field,
    scope: "mac",
    replacement: null,
    autoMigrated: true,
    severity: "error",
    detail: "Electron 4 and later ship no `Helper EH` / `Helper NP` app (with an older Electron, those helpers get the default `<helperBundleId>.EH` / `.NP`).",
    anchor: "machelperehbundleid-machelpernpbundleid",
  })),
  ...(["mas", "masDev"] as const).flatMap(parent =>
    Object.entries(MAS_REMOVED_FIELDS).map(([key, detail]): LegacyConfigOption => ({
      key,
      parent: [parent],
      replacement: null,
      autoMigrated: true,
      severity: "error",
      detail,
      anchor: "mas-masdev-options",
    }))
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
  lines.push(`  ${option.docsUrl ?? CONFIG_CHANGES_URL}#${option.anchor}`)
  return lines.join("\n")
}
