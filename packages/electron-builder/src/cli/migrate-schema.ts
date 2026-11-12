import { createRequire } from "node:module"
import {
  ALL_PLATFORM_KEYS,
  AZURE_KNOWN_FIELDS,
  collectExplicitReincludes,
  CORE24_BUILD_ENVIRONMENT_FLAGS,
  DEFAULT_EXCLUDED_EXTENSIONS,
  ELECTRON_DOWNLOAD_DROPPED,
  FILE_OPTION_KEYS,
  formatLegacyOptionMessage,
  isInheritedPublishDropped,
  LINUX_UNREAD_TARGET_OPTIONS,
  MAC_HELPER_REMOVED_FIELDS,
  MAC_PLATFORM_KEYS,
  MAC_SIGN_FIELDS,
  MAC_SIGN_REMOVED_FIELDS,
  MAC_SIGN_UNREAD_FIELDS,
  MAC_UNIVERSAL_FIELDS,
  MAS_CERTIFICATE_WARNING,
  MAS_REMOVED_CERTIFICATE_FIELDS,
  MAS_REMOVED_FIELDS,
  MSI_WRAPPED_ONE_CLICK_WARNING,
  MSI_WRAPPED_REMOVED_FIELDS,
  NSIS_CONFIG_KEYS,
  PUBLISH_MANAGED_OPTIONS,
  RESOLVED_LEGACY_CONFIG_OPTIONS,
  SNAP_CORE_KEYS,
  SNAP_CORE_TARGET_OPTION_KEYS,
  UPDATE_MANIFEST_PLATFORM_KEYS,
  V26_MERGED_TARGET_PUBLISH,
  v26Boolean,
} from "app-builder-lib/internal"
import { log, orNullIfFileNotExist } from "builder-util"
import { asArray, isLoopbackHostname, isValidPublisherNameDn } from "builder-util-runtime"
import { resolveDefaultKeywordList } from "builder-util/internal"
import { promises as fs } from "fs"
import * as path from "path"
import type { Argv } from "yargs"
import { loadTypeScript, migrateProgrammaticSource } from "./migrate-schema-programmatic.js"

const _require = createRequire(import.meta.url)

// ─── Public types ─────────────────────────────────────────────────────────────

export interface MigrationChange {
  readonly key: string
  readonly description: string
}

export interface MigrationResult {
  readonly migrated: Record<string, any>
  readonly changes: MigrationChange[]
  readonly warnings: string[]
  /** Informational notices that are not config changes — they never flip `modified` or trigger a file write. */
  readonly advisories: string[]
  readonly modified: boolean
}

// ─── Pure migration logic ─────────────────────────────────────────────────────

// The v26 -> v27 key mapping is owned by app-builder-lib so the runtime guard
// (`checkLegacyConfiguration`) and this migrator cannot drift apart. Re-exported here because these
// names are part of this module's existing public surface.
export { AZURE_KNOWN_FIELDS, ELECTRON_DOWNLOAD_DROPPED, MAC_SIGN_FIELDS, MAC_SIGN_REMOVED_FIELDS, MAC_UNIVERSAL_FIELDS } from "app-builder-lib/internal"

// Advisory surfaced (informational only — never rewrites the config) when a project builds an nsis-web target. As of v27,
// electron-updater rejects web-installer updates unless disableWebInstaller is false (v27+ nsis-web installs opt in automatically).
export const NSIS_WEB_ADVISORY =
  "nsis-web target detected. In v27, electron-updater rejects web-installer updates (ERR_UPDATER_WEB_INSTALLER_DISABLED) unless autoUpdater.disableWebInstaller is false; " +
  "installs made by a v27+ nsis-web installer opt in automatically, so set autoUpdater.disableWebInstaller = false in your main process (a runtime setting, not a build-config key) " +
  "for installs made by an older installer or when switching from nsis to nsis-web. " +
  "The nsis-web installer also verifies a --package-file package, and a package downloaded from the URL derived from the publish configuration (no nsisWeb.appPackageUrl), against its built-in hashes; " +
  "set nsisWeb.allowUnverifiedAppPackage: true only if one installer is used with packages of other builds. " +
  "See https://www.electron.build/docs/migration/v27-runtime-changes#disablewebinstaller-defaults-to-true"

// Advisory surfaced when nsis/nsisWeb installs per-machine. v27 sets isAdminRightsRequired in the update info of per-machine builds, so
// electron-updater starts those updates with elevate.exe and skips them in the automatic install at launch.
export const NSIS_PER_MACHINE_UPDATE_ADVISORY =
  "nsis/nsisWeb perMachine: true detected. In v27, electron-updater starts per-machine updates with elevate.exe directly and does not install them automatically at launch " +
  'with autoInstallEvent "onNextLaunch" (call autoUpdater.installPendingUpdateIfAvailable()). ' +
  "See https://www.electron.build/docs/migration/v27-runtime-changes#nsis-per-machine-builds-set-isadminrightsrequired"

// Advisory surfaced when a custom win.sign.sign hook has no publisherName. v27 fails such a build when it writes app-update.yml.
export const WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY =
  "win.sign.sign (custom signing hook) without win.sign.publisherName detected. In v27, a signed build that writes app-update.yml " +
  "(an nsis, nsis-web or electronUpdaterAware appx target with a publish configuration, including one inferred from a GitHub repository) fails with InvalidConfigurationError " +
  "because electron-builder cannot tell which certificate the hook signs with (a certificate in the config or from WIN_CSC_LINK / CSC_LINK doesn't supply the publisher name of a hook). " +
  "Set win.sign.publisherName to the subject of the certificate your hook signs with, or win.verifyUpdateCodeSignature: false only if your updates are not Authenticode-signed. " +
  "See https://www.electron.build/docs/migration/v27-build-changes#windows-publishername-is-validated-against-the-signing-certificate"

// Advisory surfaced when win.sign.publisherName has an entry that is not a distinguished name (DN), e.g. a bare name. v27 fails such a
// build, because electron-updater 7 never matches such an entry.
export const WIN_PUBLISHER_NAME_DN_ADVISORY =
  "win.sign.publisherName that is not a distinguished name detected. In v27, every publisherName entry must be in distinguished name (DN) " +
  'format, e.g. "CN=My Company, O=My Company, C=US": electron-updater 7 never matches a bare name, so the build fails with InvalidConfigurationError. ' +
  "Set win.sign.publisherName to the certificate subject (on Windows, (Get-AuthenticodeSignature <signed .exe>).SignerCertificate.Subject prints it), " +
  "or (unless a custom win.sign.sign hook signs) remove it to derive CN=<common name> from the signing certificate. " +
  "See https://www.electron.build/docs/migration/v27-build-changes#windows-publishername-must-be-a-distinguished-name"

// Advisory surfaced when Windows signing is disabled (win.sign: false / null) or win.sign.publisherName is null, while
// win.verifyUpdateCodeSignature is not false. v27 fails a build that writes app-update.yml without publisherName, because
// electron-updater 7 rejects every update of such an app; publisherName: null no longer opts out.
export const WIN_MISSING_PUBLISHER_NAME_ADVISORY =
  "win.sign: false / null or win.sign.publisherName: null detected without win.verifyUpdateCodeSignature: false. In v27, a build that writes app-update.yml " +
  "(an nsis, nsis-web or electronUpdaterAware appx target with a publish configuration, including one inferred from a GitHub repository) fails with " +
  "InvalidConfigurationError when it has no publisherName, because electron-updater 7 rejects every update of such an app; publisherName: null no longer opts out. " +
  'Sign the build, set win.sign: { type: "signtool", publisherName: ["CN=..."] } to the subject of the certificate that signs your installer (e.g. when you sign outside electron-builder), ' +
  "or set win.verifyUpdateCodeSignature: false to opt out of update signature verification explicitly. " +
  "See https://www.electron.build/docs/migration/v27-build-changes#missing-publishername-fails-update-verification"

/** True when `publisherName` (a string or a list) has an entry that is not a distinguished name. */
export function hasInvalidPublisherNameDn(publisherName: unknown): boolean {
  if (publisherName == null) {
    return false
  }
  return (Array.isArray(publisherName) ? publisherName : [publisherName]).some(it => !isValidPublisherNameDn(it))
}

// Advisory surfaced when a mac/mas/masDev config does not name its own entitlements file. v27 stopped granting
// allow-unsigned-executable-memory and disable-library-validation in the bundled default, which only fails at runtime.
export const MAC_ENTITLEMENTS_ADVISORY =
  "In v27 the bundled default macOS entitlements grant only com.apple.security.cs.allow-jit (allow-unsigned-executable-memory and disable-library-validation are no longer granted). " +
  "If you rely on the default (no mac.sign.entitlements and no build/entitlements.mac.plist) and your app loads native modules, frameworks, or plugins signed by another Team ID (or unsigned), " +
  "add those entitlements back in build/entitlements.mac.plist. See https://www.electron.build/docs/migration/v27-runtime-changes#macos-default-entitlements-tightened"

// Advisory surfaced when forceCodeSigning is set. v27 extends it to notarization and update-manifest signing, and verifies signatures.
export const FORCE_CODE_SIGNING_ADVISORY =
  "forceCodeSigning detected. In v27 it also fails the build when macOS notarization (no APPLE_* credentials) or update-manifest signing (no ELECTRON_BUILDER_UPDATE_SIGN_KEY) is skipped, " +
  "also in builds that do not publish, and fails macOS builds on hosts other than macOS and in pull-request builds; it also verifies the signatures the build produces. " +
  "Provide the credentials wherever it is set, opt out explicitly with mac.notarize: false / updateManifestSigning: false, or pass -c.forceCodeSigning=false to builds that cannot sign. " +
  "See https://www.electron.build/docs/migration/v27-build-changes#forcecodesigning-covers-notarization-and-update-manifests"

// Advisory surfaced when a generic publish url carries a query string (typically a token). Same rule and solution as the build warning
// (PublishManager's warnAboutGenericFeedQuery): the feed query stays on the feed's origin, and the app's autoUpdater.crossOriginHeaders
// chooses the request headers sent to another origin.
export const FEED_QUERY_ADVISORY =
  "generic publish url with a query string detected. electron-updater adds the feed url's query string only to requests on the feed's origin (scheme, host and port), " +
  "such as the channel file and the relative download URLs electron-builder writes: a URL on another origin, such as an absolute download url in latest*.yml, " +
  "keeps its own query string and is requested without the feed's. The request headers from requestHeaders / addAuthHeader go to every request on the feed's origin, " +
  "and to a request or redirect to another origin only the ones the app's autoUpdater.crossOriginHeaders keeps for it. " +
  "If a download on another origin needs the credential, serve the update files from the feed origin (relative files[].url, the default), use pre-signed URLs, " +
  "or send the credential as a request header (requestHeaders / addAuthHeader) that the app's autoUpdater.crossOriginHeaders keeps for the origin that needs it. " +
  "See https://www.electron.build/docs/migration/v27-runtime-changes#update-credentials-stay-on-the-feeds-origin"

// Advisory surfaced for a publish feed that electron-updater requests over plain http to a host that is not loopback. Same rule and
// solution as the build warning (PublishManager's warnAboutInsecureFeed).
export const INSECURE_FEED_ADVISORY =
  'publish feed over plain http to a host that is not loopback detected (a generic or custom url, a github protocol: "http" or an s3 endpoint). ' +
  "electron-updater rejects every update request over http to a host that is not loopback (localhost, 127.0.0.0/8, ::1) with ERR_UPDATER_INSECURE_FEED, " +
  "unless the app sets autoUpdater.allowInsecureFeed (meant for dev runs: autoUpdater.allowInsecureFeed = !app.isPackaged). Serve the updates over https. " +
  "See https://www.electron.build/docs/migration/v27-runtime-changes#update-requests-require-https"

// Advisory surfaced when a target section's publish leaves out what electron-builder 26 merged in from the publish it inherits (see
// isInheritedPublishDropped). No rewrite is lossless: writing the merged value would add providers and move the feed for configs written for
// 26.12.0 or earlier, which did not merge.
export const TARGET_PUBLISH_REPLACES_ADVISORY =
  "target-level publish that leaves out a provider or option of the publish it inherits, or starts with another provider, detected " +
  "(e.g. deb.publish next to linux.publish, or nsisWeb.publish next to nsis.publish). " +
  "In v27 a target's publish replaces the inherited one instead of being merged with it: the target's artifacts are uploaded only to its own providers, " +
  "and the first of them is the update feed of a target that writes update info. " +
  "electron-builder 26 merged two lists (the inherited providers first) or two objects for appImage, deb, rpm, pacman, freebsd, p5p, apk and flatpak (26.12.1 and later), " +
  "snapcraft or snap without a snapStore provider (26.12.0 and later), nsisWeb (26.12.1 and later), and appx, msi and msiWrapped. " +
  "Add every provider and option the target should keep to its own publish, the inherited first provider first if installed apps poll it. " +
  "See https://www.electron.build/docs/migration/v27-build-changes#target-publish-replaces-platform-publish"

/**
 * Whether electron-updater requests the feed of the publish entry `entry` over plain http to a host that is not loopback, as the build
 * warns for it (see PublishManager's warnAboutInsecureFeed): a generic or custom `url`, a github `protocol: "http"` (the `host`, github.com
 * by default) or an s3 `endpoint` without `accelerate`. A value that is not a string (or, for `accelerate`, not a boolean) is not read.
 *
 * @internal exported for migrate-schema-programmatic
 */
export function isInsecureFeedEntry(entry: unknown): boolean {
  if (!isPlainObject(entry)) {
    return false
  }
  let url: unknown
  if (entry.provider === "generic" || entry.provider === "custom") {
    url = entry.url
  } else if (entry.provider === "github") {
    const host: unknown = entry.host === undefined ? "github.com" : entry.host
    url = entry.protocol === "http" && typeof host === "string" ? `http://${host}` : null
  } else if (entry.provider === "s3") {
    url = entry.accelerate === undefined || entry.accelerate === false ? entry.endpoint : null
  }
  if (typeof url !== "string") {
    return false
  }
  try {
    const feed = new URL(url)
    return feed.protocol === "http:" && !isLoopbackHostname(feed.hostname)
  } catch {
    return false
  }
}

/**
 * macOS signing/universal fields that v26 accepted as `null` (meaning "unset") but whose v27 type has no `null`
 * branch, so a moved `null` would fail validation. They are dropped instead of moved. `identity: null` is not in
 * this list — it means "skip signing" and `sign.identity` still accepts it.
 */
export const MAC_NULL_MEANS_UNSET_FIELDS: ReadonlySet<string> = new Set(["type", "provisioningProfile", "binaries", "signIgnore", "singleArchFiles", "x64ArchFiles"])

/**
 * What the mac → mas → masDev merge hands a later section's signing, after the migration of the earlier sections: a custom signer reaches
 * the Mac App Store apps, merged with their `sign` options, as in v26.
 */
export interface MacSignCascade {
  /** The custom signer the later sections inherit (`<section>.sign.sign`), or null. */
  readonly signer: string | null
  /** Whether that signer was a bare v26 `sign: "<module>"` the migration moved into `sign.sign`, which a 27.0.0 alpha did not merge. */
  readonly signerWasBare: boolean
  /** The latest earlier `<section>.sign` that held signing options in the configuration as written (a 27.0.0 alpha shape), or null. */
  readonly options: string | null
}

/** A section whose sign options object sets no signer now inherits one this run moved into `sign.sign`. */
export function macSignerOverMasOptionsWarning(name: string, signer: string): string {
  return (
    `${name}.sign sets no custom signer of its own, so in electron-builder v27 the ${name} app is signed by ${signer} (moved there from a bare sign value), ` +
    `which receives the ${name}.sign options, as in v26; a 27.0.0 alpha signed it with @electron/osx-sign. To keep @electron/osx-sign for it, set ${name}.sign.sign: null. ` +
    "See https://www.electron.build/docs/migration/v27-config-changes#macos-signing-macsign"
  )
}

/** A bare signer moved into `sign.sign` now receives the sign options of an earlier section, which a 27.0.0 alpha replaced with it. */
export function macSignerOverOptionsWarning(name: string, options: string): string {
  return (
    `${name}.sign is a custom signer, moved to ${name}.sign.sign. In electron-builder v27 it receives the ${options} options (identity, entitlements, …) merged with ` +
    `${name}.sign, as in v26; a 27.0.0 alpha replaced ${options} with it, so it received none of them. Check that it signs with them, or override them in ${name}.sign. ` +
    "See https://www.electron.build/docs/migration/v27-config-changes#macos-signing-macsign"
  )
}

/** A mac / mas / masDev `sign` string the v27 schema reads as the opt-out, not as a module path: ajv coerceTypes turns "false" into false and "" into null. */
export function isMacSignOptOutString(value: unknown): value is "false" | "" {
  return value === "false" || value === ""
}

/** A `sign` of "false" or "" next to v26 signing options: the opt-out cannot hold them, so both are left in place. */
export function macSignOptOutNextToOptionsWarning(name: string, value: "false" | ""): string {
  return (
    `${name}.sign is ${JSON.stringify(value)}, which electron-builder v27 reads as ${value === "" ? "null" : "false"} (skip signing), not as a custom signer, so it and ` +
    `the v26 signing options next to it were left in place. To sign with those options, replace ${name}.sign with an object of them; to skip signing, remove them. ` +
    "See https://www.electron.build/docs/migration/v27-config-changes#macos-signing-macsign"
  )
}

/** Platform keys that accepted a platform-level `asarUnpack` in v26. */
export const ASAR_PLATFORM_KEYS = ["mac", "mas", "masDev", "win", "linux"] as const

/** The certificate options v26 accepted at the root and on `linux`; v27 has them on `mac` and `win` only. */
export const CERTIFICATE_KEYS = ["cscLink", "cscKeyPassword"] as const

/** v26 `snap` options that the v27 `snapcraft.core24` shape does not accept (core24 uses the snapcraft CLI directly). */
export const SNAP_CORE24_UNSUPPORTED = ["allowNativeWayland", "useTemplateApp"] as const

/** A target name resolved like the build does: an ":<arch>" suffix is dropped and the name is lowercased ("RPM:x64" → "rpm"). */
export function normalizeTargetName(target: string): string {
  const suffixPos = target.lastIndexOf(":")
  return (suffixPos > 0 ? target.substring(0, suffixPos) : target).toLowerCase()
}

/** True when `target` (a string such as "deb" or "deb:arm64", a `{ target }` object, or an array of either) selects one of `names`. */
function hasTarget(target: any, names: ReadonlyArray<string>): boolean {
  if (target == null) {
    return false
  }
  if (typeof target === "string") {
    return names.includes(normalizeTargetName(target))
  }
  if (Array.isArray(target)) {
    return target.some(it => hasTarget(it, names))
  }
  if (typeof target === "object") {
    return hasTarget(target.target, names)
  }
  return false
}

/** True when the build config selects one of `names` via `<platform>.target` (a root-level `target` never selected anything). */
function detectTarget(config: Record<string, any>, platform: "win" | "linux", names: ReadonlyArray<string>): boolean {
  return hasTarget(config[platform]?.target, names)
}

/**
 * True when a custom `win.sign.sign` hook signs without `publisherName` and update signature verification is on (a certificate
 * in the config doesn't matter: a hook always needs publisherName). Evaluated on the migrated config, so a v26
 * `win.signtoolOptions.sign` counts too.
 */
function detectSignHookWithoutPublisherName(config: Record<string, any>): boolean {
  const win = config.win
  const sign = isPlainObject(win) ? win.sign : null
  // a function-valued hook cannot occur here: migrateConfig works on a JSON copy of the config
  return isPlainObject(sign) && typeof sign.sign === "string" && sign.publisherName === undefined && win.verifyUpdateCodeSignature !== false
}

/**
 * True when win.sign.publisherName has an entry that is not a distinguished name. Evaluated on the migrated config,
 * so a v26 `win.signtoolOptions.publisherName` / `win.azureSignOptions.publisherName` counts too.
 */
function detectPublisherNameWithoutDn(config: Record<string, any>): boolean {
  const sign = isPlainObject(config.win) ? config.win.sign : null
  return isPlainObject(sign) && hasInvalidPublisherNameDn(sign.publisherName)
}

/**
 * True when no publisherName can resolve while update signature verification is on: win.sign is false / null (a v26
 * signExecutable / signAndEditExecutable: false migrates to win.sign: false), or win.sign.publisherName is null (a v26
 * win.signtoolOptions / win.azureSignOptions publisherName: null migrates there). Evaluated on the migrated config.
 */
function detectMissingPublisherName(config: Record<string, any>): boolean {
  const win = config.win
  if (!isPlainObject(win) || win.verifyUpdateCodeSignature === false) {
    return false
  }
  return win.sign === false || win.sign === null || (isPlainObject(win.sign) && win.sign.publisherName === null)
}

/**
 * True when a mac/mas/masDev section signs with electron-builder's defaults without naming its own entitlements
 * file. A custom signer (`sign.sign`), `sign: false` (or "false" / "", read as false / null) or `sign.identity: null` (skip signing)
 * bypasses the defaults. Evaluated on the migrated config, so a bare v26 signer is already in `sign.sign`.
 */
function detectDefaultMacEntitlements(config: Record<string, any>): boolean {
  return (["mac", "mas", "masDev"] as const).some(p => {
    const platform = config[p]
    if (!isPlainObject(platform)) {
      return false
    }
    const sign = platform.sign
    if (sign === false || isMacSignOptOutString(sign) || (isPlainObject(sign) && (typeof sign.sign === "string" || typeof sign.sign === "function"))) {
      return false
    }
    return !(isPlainObject(sign) && (sign.entitlements != null || sign.identity === null))
  })
}

/** True when a root or platform/target-level `publish` (walked like step 7) has a generic provider whose url has a query string. */
/**
 * The top-level sections whose `publish` is a publish configuration: every one except the root `publish` value itself (a custom provider
 * may have an option named `publish`) and the free-form `extraMetadata` (package.json fields), as the build-time check walks them.
 */
function publishSections(config: Record<string, any>): Array<[string, Record<string, any>]> {
  return Object.entries(config).filter((entry): entry is [string, Record<string, any>] => entry[0] !== "publish" && entry[0] !== "extraMetadata" && isPlainObject(entry[1]))
}

function detectGenericFeedQuery(config: Record<string, any>): boolean {
  return [config, ...publishSections(config).map(([, section]) => section)].some(
    section =>
      isPlainObject(section) &&
      (Array.isArray(section.publish) ? section.publish : [section.publish]).some(
        (entry: any) => isPlainObject(entry) && entry.provider === "generic" && typeof entry.url === "string" && entry.url.includes("?")
      )
  )
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

/**
 * Applies all v26→v27 config transformations to a parsed config object.
 * Pure function — no I/O, safe to call in tests.
 */
export function migrateConfig(raw: Record<string, any>): MigrationResult {
  const c: Record<string, any> = JSON.parse(JSON.stringify(raw))
  const changes: MigrationChange[] = []
  const warnings: string[] = []
  const advisories: string[] = []
  // Kept keys are reported only after `modified` is computed: a key that is merely kept must not re-serialize the file
  // (dropping YAML/JSON5 comments) when nothing else changed. The build then fails with the same targeted message.
  const keptKeyWarnings: string[] = []

  // On the configuration as written, which is what v26 merged and what the programmatic migrator reads: step 7 rewrites publish entries.
  // v26.12 and later read the snap section as `snapcraft ?? snap`.
  const publishOf = (key: string) => {
    const section = key === "snapcraft" ? (c.snapcraft ?? c.snap) : c[key]
    return isPlainObject(section) ? section.publish : undefined
  }
  const replacesInheritedPublish = Object.entries(V26_MERGED_TARGET_PUBLISH).some(([target, inherited]) =>
    isInheritedPublishDropped(target, publishOf(inherited), publishOf(target))
  )

  // ── 1. electronCompile ────────────────────────────────────────────────────
  if ("electronCompile" in c) {
    delete c.electronCompile
    changes.push({ key: "electronCompile", description: "removed electronCompile (unsupported since v27; migrate to electron-vite, esbuild, or webpack)" })
  }

  // ── 2. Removed framework fields ──────────────────────────────────────────
  for (const key of ["framework", "nodeVersion", "launchUiVersion"] as const) {
    if (key in c) {
      delete c[key]
      changes.push({ key, description: `removed ${key} (Electron is the only supported framework in v27)` })
    }
  }

  // ── 2b. disableDefaultIgnoredFiles removed (root + platform configs) ──────
  // mas/masDev are MacConfiguration-derived, so they accept the (now-removed) key too.
  for (const obj of [c, c.mac, c.mas, c.masDev, c.win, c.linux]) {
    if (obj != null && typeof obj === "object" && "disableDefaultIgnoredFiles" in obj) {
      delete obj.disableDefaultIgnoredFiles
      changes.push({
        key: "disableDefaultIgnoredFiles",
        description: "removed disableDefaultIgnoredFiles (in v27, include a default-excluded file via an explicit `fileOptions.files` glob, e.g. `**/*.obj`)",
      })
    }
  }

  // ── 2c. linux.syncDesktopName removed (always-on in v27) ──────────────────
  // The flag is gone from the type; the behaviour it gated (deriving the installed .desktop filename
  // from desktopName) is now always on. Leaving the key would fail v27 schema validation (noExtraProps).
  if (c.linux != null && typeof c.linux === "object" && "syncDesktopName" in c.linux) {
    const wasDisabled = c.linux.syncDesktopName === false
    delete c.linux.syncDesktopName
    changes.push({
      key: "linux.syncDesktopName",
      description: "removed linux.syncDesktopName (the installed .desktop filename is always synced from desktopName in v27)",
    })
    if (wasDisabled) {
      warnings.push(
        "linux.syncDesktopName: false disabled desktop-name syncing in v26. In v27 the installed .desktop filename is always derived from `desktopName` " +
          "(falling back to executableName). If you relied on the old filename, set `desktopName` explicitly to control it."
      )
    }
  }

  // ── 2d. root-level target removed (it never selected a target) ───────────
  // electron-builder reads only mac.target / win.target / linux.target. The value is never moved to a platform:
  // zip / 7z / dir name no platform, and placing dmg / nsis / deb there would change what is built.
  if ("target" in c) {
    const value = c.target
    delete c.target
    changes.push({ key: "target", description: "removed the root-level target (it never selected a target; targets are set per platform)" })
    if (value != null) {
      warnings.push(`the root-level target ${JSON.stringify(value)} never had an effect and was removed; to build it, set it under mac.target, win.target or linux.target`)
    }
  }

  // ── 2e. msiWrapped installer options and msix.electronUpdaterAware removed (they never had an effect) ──
  // The wrapped NSIS installer takes the installer options from nsis.*: they are never moved there, which would change it.
  if (isPlainObject(c.msiWrapped)) {
    if (c.msiWrapped.oneClick === false) {
      warnings.push(MSI_WRAPPED_ONE_CLICK_WARNING)
    }
    for (const key of MSI_WRAPPED_REMOVED_FIELDS) {
      if (key in c.msiWrapped) {
        delete c.msiWrapped[key]
        changes.push({ key: `msiWrapped.${key}`, description: `removed msiWrapped.${key} (no effect on the MSI wrapper; the wrapped installer uses nsis.${key})` })
      }
    }
  }
  if (isPlainObject(c.msix) && "electronUpdaterAware" in c.msix) {
    delete c.msix.electronUpdaterAware
    changes.push({ key: "msix.electronUpdaterAware", description: "removed msix.electronUpdaterAware (it had no effect: MSIX writes no update info)" })
  }

  // ── 2f. mas / masDev options Mac App Store builds never read, and the Helper EH / NP bundle ids ──
  // Before step 7, which would rewrite a mas.publish first. Never moved to mac, which would change the macOS build; only key
  // names are reported, because the certificate options hold secrets.
  for (const platform of ["mas", "masDev"] as const) {
    if (!isPlainObject(c[platform])) {
      continue
    }
    if (MAS_REMOVED_CERTIFICATE_FIELDS.some(key => key in c[platform]) && !warnings.includes(MAS_CERTIFICATE_WARNING)) {
      warnings.push(MAS_CERTIFICATE_WARNING)
    }
    for (const key of Object.keys(MAS_REMOVED_FIELDS)) {
      if (key in c[platform]) {
        delete c[platform][key]
        changes.push({ key: `${platform}.${key}`, description: `removed ${platform}.${key} (Mac App Store builds never read it there)` })
      }
    }
  }
  for (const platform of MAC_PLATFORM_KEYS) {
    for (const key of MAC_HELPER_REMOVED_FIELDS) {
      if (isPlainObject(c[platform]) && key in c[platform]) {
        delete c[platform][key]
        changes.push({ key: `${platform}.${key}`, description: `removed ${platform}.${key} (Electron 4 and later ship no such helper)` })
      }
    }
  }

  // ── 3. npmSkipBuildFromSource → buildDependenciesFromSource ───────────────
  if ("npmSkipBuildFromSource" in c) {
    // will be picked up by the nativeModules step below
    if (!("buildDependenciesFromSource" in c)) {
      c.buildDependenciesFromSource = !c.npmSkipBuildFromSource
    }
    delete c.npmSkipBuildFromSource
    changes.push({ key: "npmSkipBuildFromSource", description: "renamed npmSkipBuildFromSource → buildDependenciesFromSource (then grouped under nativeModules)" })
  }

  // ── 4. nativeModules grouping ─────────────────────────────────────────────
  const rootNativeKeys = ["buildDependenciesFromSource", "nodeGypRebuild", "npmRebuild", "nativeRebuilder"] as const
  if (rootNativeKeys.some(k => k in c)) {
    const sub: Record<string, any> = { ...(c.nativeModules ?? {}) }
    for (const key of ["buildDependenciesFromSource", "nodeGypRebuild", "npmRebuild"] as const) {
      if (key in c) {
        sub[key] = c[key]
        delete c[key]
        changes.push({ key, description: `moved ${key} → nativeModules.${key}` })
      }
    }
    if ("nativeRebuilder" in c) {
      if (c.nativeRebuilder === "legacy") {
        // v27 dropped the app-builder binary rebuilder; rebuildMode only selects @electron/rebuild's mode.
        warnings.push(
          'nativeRebuilder: "legacy" (the app-builder binary rebuilder) was removed in v27 — native modules are always rebuilt with @electron/rebuild. ' +
            'The value was dropped, so the default nativeModules.rebuildMode ("sequential") applies.'
        )
      } else {
        sub.rebuildMode = c.nativeRebuilder
      }
      delete c.nativeRebuilder
      changes.push({ key: "nativeRebuilder", description: "renamed nativeRebuilder → nativeModules.rebuildMode" })
    }
    if (Object.keys(sub).length > 0 || c.nativeModules != null) {
      c.nativeModules = sub
    }
  }

  // ── 5. Legacy asar keys → asarUnpack ─────────────────────────────────────
  // Hyphenated root-level variants
  for (const old of ["asar-unpack", "asar-unpack-dir"] as const) {
    if (old in c) {
      c.asarUnpack = mergeAsarUnpack(c.asarUnpack, c[old])
      delete c[old]
      changes.push({ key: old, description: `renamed ${old} → asarUnpack` })
    }
  }
  // Nested asar.unpackDir (legacy pre-v26; asar.unpack is now the canonical location, handled in step 11)
  if (c.asar != null && typeof c.asar === "object") {
    if ("unpackDir" in c.asar) {
      c.asarUnpack = mergeAsarUnpack(c.asarUnpack, c.asar.unpackDir)
      delete c.asar.unpackDir
      changes.push({ key: "asar.unpackDir", description: "moved asar.unpackDir → asarUnpack" })
    }
    if (Object.keys(c.asar).length === 0) {
      delete c.asar
    }
  }

  // ── 6. appImage.systemIntegration removed ────────────────────────────────
  if (c.appImage != null && "systemIntegration" in c.appImage) {
    delete c.appImage.systemIntegration
    changes.push({ key: "appImage.systemIntegration", description: "removed appImage.systemIntegration (handled automatically by AppImageLauncher in v27)" })
    if (Object.keys(c.appImage).length === 0) {
      delete c.appImage
    }
  }

  // ── 6b. snap → snapcraft restructuring ────────────────────────────────────
  // Before step 7, so a snap.publish moved to snapcraft.publish is rewritten there, and one of a dropped snap is not.
  if ("snap" in c) {
    migrateSnap(c, changes, warnings)
  }

  // ── 6c. snapcraft.<core>.publish / artifactName → snapcraft.* (never read per base) ──
  if (isPlainObject(c.snapcraft)) {
    migrateSnapcraftCoreTargetOptions(c.snapcraft, changes, warnings)
  }

  // ── 6d. Linux target options that never had an effect (after 6b: a v26 snap.synopsis is under snapcraft.<base> by now) ──
  for (const { parent, key } of LINUX_UNREAD_TARGET_OPTIONS) {
    const holder: unknown = parent.reduce<unknown>((node, segment) => (isPlainObject(node) ? node[segment] : undefined), c)
    if (isPlainObject(holder) && key in holder) {
      delete holder[key]
      const path = [...parent, key].join(".")
      changes.push({ key: path, description: `removed ${path} (it never had an effect)` })
    }
  }

  // ── 6e. snapcraft.core24 build switches → buildEnvironment (after 6b: a v26 snap is under snapcraft.<base> by now) ──
  if (isPlainObject(c.snapcraft) && isPlainObject(c.snapcraft.core24)) {
    migrateCore24BuildEnvironment(c.snapcraft.core24, changes, warnings, keptKeyWarnings)
  }

  // ── 7. GitHub / GitLab vPrefixedTagName → tagNamePrefix; fields electron-builder writes into app-update.yml removed ──
  if (c.publish != null) {
    migratePublishEntries(c, "publish", changes, warnings, keptKeyWarnings)
  }
  // Also handle publish nested inside any platform/target section (mac, win, nsis, dmg, snapcraft, …)
  for (const [name, section] of publishSections(c)) {
    if (section.publish != null) {
      migratePublishEntries(section, `${name}.publish`, changes, warnings, keptKeyWarnings)
    }
  }

  // ── 9. helper-bundle-id → mac.helperBundleId ──────────────────────────────
  if ("helper-bundle-id" in c) {
    const mac: Record<string, any> = { ...(c.mac ?? {}) }
    if (!("helperBundleId" in mac)) {
      mac.helperBundleId = c["helper-bundle-id"]
    }
    delete c["helper-bundle-id"]
    c.mac = mac
    changes.push({ key: "helper-bundle-id", description: "moved helper-bundle-id → mac.helperBundleId" })
  }

  // ── 10. squirrelWindows.noMsi → squirrelWindows.msi (inverted) ────────────
  if (c.squirrelWindows != null && typeof c.squirrelWindows === "object" && "noMsi" in c.squirrelWindows) {
    const sq: Record<string, any> = c.squirrelWindows
    if (!("msi" in sq)) {
      sq.msi = !sq.noMsi
    }
    delete sq.noMsi
    changes.push({ key: "squirrelWindows.noMsi", description: "replaced squirrelWindows.noMsi → squirrelWindows.msi (inverted boolean)" })
  }

  // ── 10b. squirrelWindows.customSquirrelVendorDir removed (not auto-migrated) ──
  // The v27 replacement (a toolsets.squirrel ToolsetCustom bundle) needs a different directory layout, so the
  // key is left in place: the build then fails with a targeted message instead of silently switching the
  // vendored Squirrel binaries back to the default bundle.
  if (isPlainObject(c.squirrelWindows) && "customSquirrelVendorDir" in c.squirrelWindows) {
    warnings.push(
      "squirrelWindows.customSquirrelVendorDir was removed in v27 and cannot be migrated automatically. " +
        'Supply the custom bundle via toolsets.squirrel: { url: "file:///abs/path" } — the bundle must contain an electron-winstaller/vendor/ subtree ' +
        "(customSquirrelVendorDir pointed at the vendor files directly) — or remove the key to use the default Squirrel bundle."
    )
  }

  // ── 11. asar consolidation ───────────────────────────────────────────────
  // Move root-level asarUnpack / disableSanityCheckAsar / disableAsarIntegrity
  // into the asar object. In v26 these applied to every platform independently of `asar`; in v27 they live
  // inside it, and a platform-level `asar` replaces the root one wholesale — so capture them first for step 11b.
  const rootAsarValue = c.asar
  const rootFlatAsar: Record<string, any> = {}
  if ("asarUnpack" in c) {
    rootFlatAsar.unpack = c.asarUnpack
  }
  if ("disableSanityCheckAsar" in c) {
    rootFlatAsar.disableSanityCheck = c.disableSanityCheckAsar
  }
  if ("disableAsarIntegrity" in c) {
    rootFlatAsar.disableIntegrity = c.disableAsarIntegrity
  }
  if (c.asar === false) {
    // No effect on the root build; step 11b still carries them into any platform that re-enables asar.
    for (const key of ["asarUnpack", "disableSanityCheckAsar", "disableAsarIntegrity"] as const) {
      if (key in c) {
        delete c[key]
        changes.push({ key, description: `removed ${key} (no effect with asar: false)` })
      }
    }
  } else {
    const asarSub: Record<string, any> = typeof c.asar === "object" && c.asar != null ? { ...c.asar } : {}
    if ("asarUnpack" in c) {
      asarSub.unpack = mergeAsarUnpack(asarSub.unpack, c.asarUnpack)
      delete c.asarUnpack
      changes.push({ key: "asarUnpack", description: "moved asarUnpack → asar.unpack" })
    }
    if ("disableSanityCheckAsar" in c) {
      asarSub.disableSanityCheck = c.disableSanityCheckAsar
      delete c.disableSanityCheckAsar
      changes.push({ key: "disableSanityCheckAsar", description: "moved disableSanityCheckAsar → asar.disableSanityCheck" })
    }
    if ("disableAsarIntegrity" in c) {
      asarSub.disableIntegrity = c.disableAsarIntegrity
      delete c.disableAsarIntegrity
      changes.push({ key: "disableAsarIntegrity", description: "moved disableAsarIntegrity → asar.disableIntegrity" })
    }
    if (c.asar === true) {
      if (Object.keys(asarSub).length > 0) {
        c.asar = asarSub
        changes.push({ key: "asar", description: `replaced asar: true with an asar object carrying ${Object.keys(asarSub).join(", ")}` })
      } else {
        delete c.asar
        changes.push({ key: "asar", description: "removed redundant asar: true (asar is enabled by default; the explicit `true` is not needed)" })
      }
    } else if (Object.keys(asarSub).length > 0) {
      c.asar = asarSub
    }
  }

  // ── 11b. platform-level asar ──────────────────────────────────────────────
  for (const platform of ASAR_PLATFORM_KEYS) {
    if (isPlainObject(c[platform])) {
      migratePlatformAsar(c, platform, rootAsarValue, rootFlatAsar, changes)
    }
  }

  // ── 12. win.sign unification ───────────────────────────────────────────────
  // win.signtoolOptions → win.sign: { type: "signtool", … }
  // win.azureSignOptions → win.sign: { type: "azure", … }  (extra keys → additionalMetadata)
  // win.signAndEditExecutable / win.signExecutable removed
  if (c.win != null && typeof c.win === "object") {
    const win: Record<string, any> = c.win

    // Remove defunct flags — signAndEditExecutable/signExecutable no longer exist in v27. Either one set to
    // false skipped ALL signing in v26, so both map to win.sign: false (signAndEditExecutable also skipped
    // resource editing, which always runs in v27 — that part has no equivalent).
    const signingDisabled = win.signExecutable === false || win.signAndEditExecutable === false
    if ("signAndEditExecutable" in win) {
      const val = win.signAndEditExecutable
      delete win.signAndEditExecutable
      if (val === false) {
        warnings.push(
          "win.signAndEditExecutable: false was used to skip both resource editing and signing. " +
            "In v27, resource editing always runs; signing is still skipped via win.sign: false. " +
            "There is no v27 equivalent that also skips resource editing — apply resources manually if needed."
        )
      }
      changes.push({ key: "win.signAndEditExecutable", description: "removed win.signAndEditExecutable (resource editing always runs in v27)" })
    }
    if ("signExecutable" in win) {
      delete win.signExecutable
      changes.push({ key: "win.signExecutable", description: "removed win.signExecutable (signing is enabled by default when credentials are available)" })
    }
    if (signingDisabled && win.sign == null) {
      win.sign = false
      changes.push({ key: "win.sign", description: "set win.sign: false (v26 signExecutable/signAndEditExecutable: false disabled signing; resource editing still runs)" })
    }

    if (win.sign === false && (win.azureSignOptions != null || win.signtoolOptions != null)) {
      // Signing was switched off, so the legacy options never applied. Only their key names are reported —
      // the values can hold certificate passwords.
      const dropped = (["signtoolOptions", "azureSignOptions"] as const).filter(k => win[k] != null)
      for (const k of dropped) {
        delete win[k]
        changes.push({ key: `win.${k}`, description: `removed win.${k} (signing is disabled with win.sign: false)` })
      }
      warnings.push(
        `win.sign is false (signing disabled), so [${dropped.map(k => `win.${k}`).join(", ")}] had no effect and ${dropped.length === 1 ? "was" : "were"} removed. ` +
          'To sign in v27, replace win.sign: false with win.sign: { type: "signtool" | "azure", … } carrying those options.'
      )
    }

    const hasAzure = win.azureSignOptions != null
    const hasSigntool = win.signtoolOptions != null

    if (hasAzure || hasSigntool) {
      const signAlreadySet = "sign" in win && win.sign !== null && win.sign !== undefined

      if (signAlreadySet) {
        warnings.push(
          "win.sign is already set alongside " +
            (hasAzure ? "win.azureSignOptions" : "win.signtoolOptions") +
            ". Remove the legacy key manually after verifying win.sign is correct."
        )
      } else {
        if (hasAzure && hasSigntool) {
          warnings.push(
            "Both win.azureSignOptions and win.signtoolOptions are set. " +
              "win.signtoolOptions will be dropped and win.azureSignOptions will be migrated to win.sign: { type: 'azure', … } (Azure took priority in v26). " +
              "Verify the migrated win.sign block is correct for your project."
          )
          delete win.signtoolOptions
        }

        if (hasAzure) {
          const azure: Record<string, any> = { ...win.azureSignOptions }
          delete win.azureSignOptions

          // Move extra (untyped) keys into additionalMetadata
          const extra: Record<string, string> = {}
          for (const [k, v] of Object.entries(azure)) {
            if (!AZURE_KNOWN_FIELDS.has(k) && typeof v === "string") {
              extra[k] = v
              delete azure[k]
            }
          }
          if (Object.keys(extra).length > 0) {
            azure.additionalMetadata = { ...(azure.additionalMetadata ?? {}), ...extra }
            changes.push({
              key: "win.azureSignOptions",
              description: `moved extra keys [${Object.keys(extra).join(", ")}] into win.sign.additionalMetadata`,
            })
          }

          win.sign = { ...azure, type: "azure" }
          changes.push({ key: "win.azureSignOptions", description: 'moved win.azureSignOptions → win.sign: { type: "azure", … }' })
        } else {
          const signtool: Record<string, any> = { ...win.signtoolOptions }
          delete win.signtoolOptions
          win.sign = { ...signtool, type: "signtool" }
          changes.push({ key: "win.signtoolOptions", description: 'moved win.signtoolOptions → win.sign: { type: "signtool", … }' })
        }
      }
    }
  }

  // ── 13. mac/mas/masDev signing + universal consolidation ──────────────────
  // Signing fields (incl. identity) move into `sign`, a custom signer into `sign.sign`; mergeASARs/singleArchFiles/x64ArchFiles into
  // `universal`. A custom signer reaches the later sections through the mac → mas → masDev merge, which `cascade` follows.
  let cascade: MacSignCascade = { signer: null, signerWasBare: false, options: null }
  for (const platform of MAC_PLATFORM_KEYS) {
    const section = c[platform]
    if (section == null || typeof section !== "object") {
      continue
    }
    const wasBare = typeof section.sign === "string"
    const hadOptions = isPlainObject(section.sign) && Object.keys(section.sign).some(key => key !== "sign")
    migrateMacSigning(section, platform, cascade, changes, warnings, keptKeyWarnings)
    // fold the migrated sign: false (or "false" / "", left in place) replaces the earlier ones, a set sign.sign replaces the inherited signer
    const sign = section.sign
    if (sign === false || sign === null || isMacSignOptOutString(sign)) {
      cascade = { signer: null, signerWasBare: false, options: null }
    } else {
      if (isPlainObject(sign) && sign.sign !== undefined) {
        cascade = { ...cascade, signer: typeof sign.sign === "string" ? `${platform}.sign.sign` : null, signerWasBare: wasBare }
      }
      if (hadOptions) {
        cascade = { ...cascade, options: `${platform}.sign` }
      }
    }
    migrateMacUniversal(section, platform, changes)
  }

  // ── 14. electronDownload → electronGet ────────────────────────────────────
  if ("electronDownload" in c) {
    migrateElectronDownload(c, "electronDownload", changes, warnings)
  } else if (isPlainObject(c.electronGet) && Object.keys(c.electronGet).some(isLegacyElectronDownloadKey)) {
    // A hand-renamed `electronGet` that still carries the v26 shape.
    migrateElectronDownload(c, "electronGet", changes, warnings)
  }

  // ── 14b. updateManifest → updateManifestSigning (root, mac, win, linux; a 27.0.0-alpha key) ──
  // The value is kept as it is: false is still the opt-out, and null must stay null, which keeps signing required. mas / masDev never read it
  // (step 2f removes it there). A section that sets both is left for the user to merge; the build keeps rejecting the old key.
  for (const [holder, prefix] of [[c, ""], ...UPDATE_MANIFEST_PLATFORM_KEYS.map(platform => [c[platform], `${platform}.`])] as Array<[unknown, string]>) {
    if (!isPlainObject(holder) || !("updateManifest" in holder)) {
      continue
    }
    if ("updateManifestSigning" in holder) {
      const warning = updateManifestBothSetWarning(prefix)
      if (!keptKeyWarnings.includes(warning)) {
        keptKeyWarnings.push(warning)
      }
      continue
    }
    holder.updateManifestSigning = holder.updateManifest
    delete holder.updateManifest
    changes.push({ key: `${prefix}updateManifest`, description: `renamed ${prefix}updateManifest → ${prefix}updateManifestSigning (the value is unchanged)` })
  }

  // ── 15. toolsets ──────────────────────────────────────────────────────────
  if (isPlainObject(c.toolsets)) {
    migrateToolsets(c.toolsets, changes)
  }

  // ── 16. files / extraResources / extraFiles → fileOptions (root + platform configs) ──
  migrateFileOptions(c, "", changes, warnings, keptKeyWarnings)
  for (const platform of ALL_PLATFORM_KEYS) {
    if (isPlainObject(c[platform])) {
      migrateFileOptions(c[platform], `${platform}.`, changes, warnings, keptKeyWarnings)
    }
  }

  // ── 16b. includePdb → fileOptions.excludedExts (root only) ─────────────────
  // After step 16, so the excluded extensions join the fileOptions the flat keys moved into.
  migrateIncludePdb(c, changes, keptKeyWarnings)

  // Advisories (not config changes): v27 runtime defaults and behavior changes that a config rewrite cannot address.
  if (detectTarget(c, "win", ["nsis-web"])) {
    advisories.push(NSIS_WEB_ADVISORY)
  }
  if (detectDefaultMacEntitlements(c)) {
    advisories.push(MAC_ENTITLEMENTS_ADVISORY)
  }
  if (c.nsis?.perMachine === true || c.nsisWeb?.perMachine === true) {
    advisories.push(NSIS_PER_MACHINE_UPDATE_ADVISORY)
  }
  if (detectSignHookWithoutPublisherName(c)) {
    advisories.push(WIN_SIGN_HOOK_PUBLISHER_NAME_ADVISORY)
  }
  if (detectPublisherNameWithoutDn(c)) {
    advisories.push(WIN_PUBLISHER_NAME_DN_ADVISORY)
  }
  if (detectMissingPublisherName(c)) {
    advisories.push(WIN_MISSING_PUBLISHER_NAME_ADVISORY)
  }
  if (detectGenericFeedQuery(c)) {
    advisories.push(FEED_QUERY_ADVISORY)
  }
  if ([c, ...publishSections(c).map(([, section]) => section)].some(section => asArray(section.publish).some(isInsecureFeedEntry))) {
    advisories.push(INSECURE_FEED_ADVISORY)
  }
  if (replacesInheritedPublish) {
    advisories.push(TARGET_PUBLISH_REPLACES_ADVISORY)
  }
  const pdbPatterns = pdbFilesPatterns(c)
  if (pdbPatterns.length > 0) {
    advisories.push(pdbFilesPatternsAdvisory(pdbPatterns))
  }
  if (c.forceCodeSigning === true || ["mac", "win", "linux"].some(platform => isPlainObject(c[platform]) && c[platform].forceCodeSigning === true)) {
    advisories.push(FORCE_CODE_SIGNING_ADVISORY)
  }

  // ── root cscLink / cscKeyPassword → mac.* and win.*; linux.* removed ──────
  // The root value applied to macOS and Windows alike and won over their own values, so it is copied into both. Only key names are
  // reported: the values are certificates and passwords. After the advisories, which describe the configuration as written (as the
  // programmatic migrator's do): a mac section created here is no sign of a macOS build.
  for (const key of CERTIFICATE_KEYS) {
    if (!(key in c)) {
      continue
    }
    const value = c[key]
    delete c[key]
    if (value == null) {
      changes.push({ key, description: `removed ${key}: ${value} (it had no effect)` })
      continue
    }
    for (const platform of ["mac", "win"] as const) {
      if (c[platform] == null) {
        c[platform] = {}
      }
      const section = c[platform]
      if (section[key] != null && section[key] !== value) {
        warnings.push(
          `the root ${key} was copied over the different ${platform}.${key}: in v26 the root value won over it, so the build is unchanged. ` +
            `If ${platform} should use its own value, set ${platform}.${key} back.`
        )
      }
      section[key] = value
    }
    changes.push({ key, description: `moved ${key} → mac.${key} and win.${key} (the root value applied to both)` })
  }
  if (isPlainObject(c.linux)) {
    for (const key of CERTIFICATE_KEYS) {
      if (key in c.linux) {
        delete c.linux[key]
        changes.push({ key: `linux.${key}`, description: `removed linux.${key} (it never had an effect: Linux packages are not code-signed)` })
      }
    }
  }

  // ── nsis/nsisWeb/portable customNsisBinary / customNsisResources removed ──
  migrateCustomNsis(c, changes, warnings, keptKeyWarnings)
  const modified = changes.length > 0 || warnings.length > 0
  warnings.push(...keptKeyWarnings)

  return { migrated: c, changes, warnings, advisories, modified }
}

/**
 * Moves the flat `files` / `extraResources` / `extraFiles` keys of `holder` (the root or a platform config) into its
 * `fileOptions`. A key also set in `fileOptions` is dropped: the build ignores the flat key then, so dropping it keeps
 * the build output unchanged.
 */
function migrateFileOptions(holder: Record<string, any>, prefix: string, changes: MigrationChange[], warnings: string[], keptKeyWarnings: string[]): void {
  const present = FILE_OPTION_KEYS.filter(key => key in holder)
  if (present.length === 0) {
    return
  }
  const existing = holder.fileOptions
  if (existing != null && !isPlainObject(existing)) {
    keptKeyWarnings.push(
      `${prefix}fileOptions is not an object; move ${present.map(key => prefix + key).join(", ")} into it manually (e.g. ${prefix}fileOptions: { files: [...] }).`
    )
    return
  }

  const fileOptions: Record<string, any> = { ...existing }
  for (const key of present) {
    const conflict = key in fileOptions
    if (conflict) {
      warnings.push(fileOptionsConflictWarning(prefix, key))
    } else {
      fileOptions[key] = holder[key]
    }
    changes.push(fileOptionsChange(prefix, key, conflict))
    delete holder[key]
  }
  holder.fileOptions = fileOptions
}

/** The change a flat `files` / `extraResources` / `extraFiles` key makes; shared with the JS/TS codemod. */
export function fileOptionsChange(prefix: string, key: string, conflict: boolean): MigrationChange {
  const nested = `${prefix}fileOptions.${key}`
  return { key: prefix + key, description: conflict ? `removed ${prefix}${key} (${nested} is also set and takes precedence)` : `moved ${prefix}${key} → ${nested}` }
}

/** Warning for a flat key removed because its `fileOptions` counterpart is also set; shared with the JS/TS codemod. */
export function fileOptionsConflictWarning(prefix: string, key: string): string {
  const flat = prefix + key
  const nested = `${prefix}fileOptions.${key}`
  return `${flat} and ${nested} are both set; the build uses ${nested} and ignores ${flat}, so ${flat} was removed. Move any patterns you still need into ${nested}.`
}

/** Descriptions of the change the root `includePdb` makes; shared with the JS/TS codemod. */
export const INCLUDE_PDB_CHANGES = {
  removed: "removed includePdb (.pdb files are excluded by default in v27)",
  created: 'moved includePdb: true → fileOptions.excludedExts: ["default", "!pdb"]',
  appended: 'moved includePdb: true → "!pdb" in fileOptions.excludedExts',
  unneeded: "removed includePdb (fileOptions.excludedExts already keeps .pdb files)",
  overridesParent:
    'moved includePdb: false → fileOptions.excludedExts: ["default"] (the v27 default, written out so that it keeps overriding an includePdb: true from another config layer, e.g. an extends parent)',
  listKeepsPdb: "removed includePdb (fileOptions.excludedExts is set and takes precedence; it keeps .pdb files)",
} as const

/**
 * True when a `files` pattern names `.pdb` files: it is not negated, and the longest excluded extension of its (brace-expanded) basename is
 * "pdb", e.g. `native/*.pdb` or `**\/*.{node,pdb}`. Shared with the JS/TS codemod.
 */
export function namesPdbFiles(pattern: string): boolean {
  return collectExplicitReincludes([pattern]).extensions.has("pdb")
}

/**
 * Advisory for the `files` patterns that name `.pdb` files (see {@link namesPdbFiles}), each with the key that sets it (`fileOptions.files`,
 * `win.fileOptions.files`, …): v26 excluded `.pdb` files whatever `files` said unless `includePdb` was true, while in v27 such a pattern
 * includes the `.pdb` files it matches, also for a config layer that extends this one (e.g. one migrated from `includePdb: false`). Shared
 * with the JS/TS codemod.
 */
export function pdbFilesPatternsAdvisory(patterns: ReadonlyArray<{ readonly key: string; readonly pattern: string }>): string {
  const listed = patterns.map(it => `${it.key} ${JSON.stringify(it.pattern)}`).join(", ")
  return (
    `files patterns that name .pdb files detected: ${listed}. In v27 such a pattern ships the .pdb files it matches (v26 excluded .pdb files whatever files said, ` +
    'unless includePdb was true), also in configs that extend this one. To keep them out, remove the pattern, or add a negation after it, such as "!native/*.pdb". ' +
    "See https://www.electron.build/docs/migration/v27-config-changes#includepdb-fileoptionsexcludedexts"
  )
}

/** Whether a FileSet `from` is the app directory (".", "./", "" and the like), which the build resolves against it; shared with the JS/TS codemod. */
export function isAppDirFrom(from: string): boolean {
  return path.posix.normalize(from.replace(/\\/g, "/")).replace(/\/+$/, "") === "."
}

/** The patterns of a `files` value (a pattern, a FileSet or a list of them) that apply to the app directory: the strings, and the `filter` of a FileSet without `from` or with a `from` that is the app directory. */
function appFilesPatterns(files: unknown): string[] {
  const entries = Array.isArray(files) ? files : files == null ? [] : [files]
  return entries.flatMap(entry => {
    if (typeof entry === "string") {
      return [entry]
    }
    if (!isPlainObject(entry) || (entry.from != null && !(typeof entry.from === "string" && isAppDirFrom(entry.from)))) {
      return []
    }
    const filter = typeof entry.filter === "string" ? [entry.filter] : Array.isArray(entry.filter) ? entry.filter : []
    return filter.filter((it: unknown): it is string => typeof it === "string")
  })
}

/** The root and platform `fileOptions.files` patterns of a migrated config that name `.pdb` files (see {@link pdbFilesPatternsAdvisory}). */
function pdbFilesPatterns(c: Record<string, any>): Array<{ key: string; pattern: string }> {
  const result: Array<{ key: string; pattern: string }> = []
  const holders: Array<[string, unknown]> = [["", c], ...ALL_PLATFORM_KEYS.map((platform): [string, unknown] => [`${platform}.`, c[platform]])]
  for (const [prefix, holder] of holders) {
    if (isPlainObject(holder) && isPlainObject(holder.fileOptions)) {
      for (const pattern of appFilesPatterns(holder.fileOptions.files).filter(namesPdbFiles)) {
        result.push({ key: `${prefix}fileOptions.files`, pattern })
      }
    }
  }
  return result
}

/** Warning for an `includePdb` that v26 rejected, which is left in place; shared with the JS/TS codemod. */
export const INCLUDE_PDB_NOT_BOOLEAN =
  'includePdb is not a boolean (v26 accepted true / false, "true" / "false", 1 / 0 and null), so it was left in place. In v27, .pdb files are excluded by default: remove includePdb, or set fileOptions.excludedExts: ["default", "!pdb"] to keep them.'

/** The manual step for an `includePdb` whose root `fileOptions.excludedExts` cannot be migrated; shared with the JS/TS codemod. */
export function includePdbManualStep(keepPdb: boolean): string {
  return keepPdb
    ? 'replace includePdb: true with fileOptions.excludedExts: ["default", "!pdb"] manually.'
    : 'replace includePdb: false with fileOptions.excludedExts: ["default"] manually (written out, it keeps overriding an includePdb: true from another config layer).'
}

/** The change that adds "!pdb" to a platform-level `excludedExts` for `includePdb: true`; shared with the JS/TS codemod. */
export function platformExcludedExtsPdbChange(platform: string): MigrationChange {
  const key = `${platform}.fileOptions.excludedExts`
  return { key, description: `added "!pdb" to ${key} (includePdb: true; a platform-level excludedExts replaces the root one)` }
}

/**
 * True when an `excludedExts` list excludes `.pdb` files, resolved as the build does: it lists "default" or "pdb", and not "!pdb". A list without
 * "default" replaces the default extensions, so it keeps `.pdb` files, and a "!pdb" added to it would only make the build warn that the entry has
 * no effect. Unlike the build, an invalid entry is not rejected: the list is migrated as it is. Shared with the JS/TS codemod.
 */
export function excludesPdb(entries: ReadonlyArray<string>): boolean {
  const normalized = entries.map(it => (it.startsWith("!") ? `!${it.substring(1).replace(/^\./, "")}` : it.replace(/^\./, "")))
  return resolveDefaultKeywordList(normalized, DEFAULT_EXCLUDED_EXTENSIONS).result.includes("pdb")
}

/**
 * `includePdb: true` keeps `.pdb` files: it becomes `fileOptions.excludedExts: ["default", "!pdb"]` ("!pdb" is added to an existing root
 * list instead), and "!pdb" is added to each platform-level `fileOptions.excludedExts` too, since that list replaces the root one. A `false`
 * becomes `fileOptions.excludedExts: ["default"]`: the v27 default, written out because in v26 it overrode an `includePdb: true` of another
 * config layer (an `extends` parent, also an earlier entry of an `extends` list, or the config file for a programmatic `build({ config })`),
 * which no single file shows, and the list replaces such a layer's in the same way (an existing root list already does). Values are read as
 * v26 coerced them; one v26 rejected is left in place. A single-string `excludedExts` is a one-entry list, which becomes an array when
 * "!pdb" is added to it.
 */
function migrateIncludePdb(c: Record<string, any>, changes: MigrationChange[], keptKeyWarnings: string[]): void {
  if (!("includePdb" in c)) {
    return
  }
  const includePdb = v26Boolean(c.includePdb)
  if (includePdb == null) {
    keptKeyWarnings.push(INCLUDE_PDB_NOT_BOOLEAN)
    return
  }
  const fileOptions = c.fileOptions
  const list = isPlainObject(fileOptions) ? fileOptions.excludedExts : null
  if ((fileOptions != null && !isPlainObject(fileOptions)) || (list != null && !Array.isArray(list) && typeof list !== "string")) {
    const problem = isPlainObject(fileOptions) ? "fileOptions.excludedExts is not a string or an array" : "fileOptions is not an object"
    keptKeyWarnings.push(`${problem}; ${includePdbManualStep(includePdb)}`)
    // a platform list replaces the root one, so it gets "!pdb" whatever the root list is
    if (includePdb) {
      appendPdbToPlatformLists(c, changes)
    }
    return
  }

  delete c.includePdb
  if (!includePdb) {
    if (list == null) {
      c.fileOptions = { ...fileOptions, excludedExts: ["default"] }
      changes.push({ key: "includePdb", description: INCLUDE_PDB_CHANGES.overridesParent })
    } else {
      // the root list already replaces another layer's
      changes.push({ key: "includePdb", description: excludesPdb(excludedExtsEntries(list)) ? INCLUDE_PDB_CHANGES.removed : INCLUDE_PDB_CHANGES.listKeepsPdb })
    }
    return
  }
  if (list == null) {
    c.fileOptions = { ...fileOptions, excludedExts: ["default", "!pdb"] }
    changes.push({ key: "includePdb", description: INCLUDE_PDB_CHANGES.created })
  } else if (excludesPdb(excludedExtsEntries(list))) {
    fileOptions.excludedExts = withPdbRemoval(list)
    changes.push({ key: "includePdb", description: INCLUDE_PDB_CHANGES.appended })
  } else {
    changes.push({ key: "includePdb", description: INCLUDE_PDB_CHANGES.unneeded })
  }
  appendPdbToPlatformLists(c, changes)
}

/** For `includePdb: true`: adds "!pdb" to each platform-level `fileOptions.excludedExts` that excludes `.pdb` files, since it replaces the root list. */
function appendPdbToPlatformLists(c: Record<string, any>, changes: MigrationChange[]): void {
  for (const platform of ALL_PLATFORM_KEYS) {
    const platformFileOptions = c[platform]?.fileOptions
    const platformList = platformFileOptions?.excludedExts
    if ((Array.isArray(platformList) || typeof platformList === "string") && excludesPdb(excludedExtsEntries(platformList))) {
      platformFileOptions.excludedExts = withPdbRemoval(platformList)
      changes.push(platformExcludedExtsPdbChange(platform))
    }
  }
}

/** The string entries of an `excludedExts` list; a single string is a one-entry list. */
function excludedExtsEntries(list: string | Array<unknown>): string[] {
  return (typeof list === "string" ? [list] : list).filter((it: unknown): it is string => typeof it === "string")
}

/** An `excludedExts` list with "!pdb" appended; a single string becomes a list. */
function withPdbRemoval(list: string | Array<unknown>): Array<unknown> {
  return [...(typeof list === "string" ? [list] : list), "!pdb"]
}

/** The build-time guard's message for a removed key (`nsis.customNsisBinary`), reused for the keys migrate-schema leaves in place. */
export function legacyKeyMessage(fullPath: string): string {
  const option = RESOLVED_LEGACY_CONFIG_OPTIONS.find(o => o.fullPath === fullPath)
  if (option == null) {
    throw new Error(`no legacy config option for ${fullPath}`)
  }
  return formatLegacyOptionMessage(option)
}

/** Warning for a `portable.customNsisBinary.debugLogging` that migrate-schema drops. */
export const PORTABLE_DEBUG_LOGGING_DROPPED =
  "portable.customNsisBinary.debugLogging was dropped: it never had an effect on portable targets (the portable template does not enable NSIS logging), and v27 has no portable equivalent."

/**
 * `customNsisBinary.debugLogging` moves to `<section>.installerDebugLogging` (nsis / nsisWeb; dropped for portable), and an
 * emptied or null `customNsisBinary` / `customNsisResources` is removed. A custom bundle (url / checksum / version, or the resources
 * bundle) is never converted to `toolsets.nsis`: the bundle layout differs (it must carry the NSIS plugins), so the key is kept and reported.
 */
function migrateCustomNsis(c: Record<string, any>, changes: MigrationChange[], warnings: string[], keptKeyWarnings: string[]): void {
  for (const section of NSIS_CONFIG_KEYS) {
    const options = c[section]
    if (!isPlainObject(options)) {
      continue
    }
    const binaryPath = `${section}.customNsisBinary`
    const binary = options.customNsisBinary
    if (binary === null) {
      delete options.customNsisBinary
      changes.push({ key: binaryPath, description: `removed ${binaryPath}: null (the key was removed in v27)` })
    } else if (isPlainObject(binary)) {
      if ("debugLogging" in binary) {
        const debugLogging = binary.debugLogging
        delete binary.debugLogging
        if (section === "portable") {
          if (debugLogging != null) {
            warnings.push(PORTABLE_DEBUG_LOGGING_DROPPED)
          }
          changes.push({ key: `${binaryPath}.debugLogging`, description: `removed ${binaryPath}.debugLogging (no effect on portable targets)` })
        } else if (debugLogging != null && !("installerDebugLogging" in options)) {
          options.installerDebugLogging = debugLogging
          changes.push({ key: `${binaryPath}.debugLogging`, description: `moved ${binaryPath}.debugLogging → ${section}.installerDebugLogging` })
        } else {
          changes.push({ key: `${binaryPath}.debugLogging`, description: `removed ${binaryPath}.debugLogging` })
        }
      }
      if (Object.values(binary).every(v => v == null)) {
        delete options.customNsisBinary
        changes.push({ key: binaryPath, description: `removed ${binaryPath} (no custom bundle was set)` })
      } else {
        keptKeyWarnings.push(legacyKeyMessage(binaryPath))
      }
    } else if (binary !== undefined) {
      keptKeyWarnings.push(legacyKeyMessage(binaryPath))
    }

    const resourcesPath = `${section}.customNsisResources`
    if (options.customNsisResources === null) {
      delete options.customNsisResources
      changes.push({ key: resourcesPath, description: `removed ${resourcesPath}: null (the key was removed in v27)` })
    } else if (options.customNsisResources !== undefined) {
      keptKeyWarnings.push(legacyKeyMessage(resourcesPath))
    }
  }
}

/**
 * Moves macOS signing fields from a platform config (mac/mas/masDev) into the `sign` bag and
 * renames `signIgnore` → `sign.ignore`. In v26 `sign` was only a custom signer (string path / module id): it moves
 * into `sign.sign`, next to the options it receives. A bare `sign: null` (v26 "no custom signer") is dropped so it does
 * not flip to v27's "skip signing", or becomes `sign.sign: null` where it removed a signer an earlier section set.
 * A `sign` of "false" or "" stays: the v27 schema reads it as the opt-out (false / null), not as a module path.
 */
function migrateMacSigning(platform: Record<string, any>, name: string, cascade: MacSignCascade, changes: MigrationChange[], warnings: string[], keptKeyWarnings: string[]) {
  const present = MAC_SIGN_FIELDS.filter(f => f in platform)
  const hasSignIgnore = "signIgnore" in platform

  // Removed outright, not moved: ElectronSignOptions omits these and the schema rejects them, so
  // relocating them under `sign` would emit a config that fails validation on the next build.
  for (const field of MAC_SIGN_REMOVED_FIELDS) {
    if (field in platform) {
      delete platform[field]
      changes.push({ key: `${name}.${field}`, description: `removed ${name}.${field} (@electron/osx-sign 2.x dropped the spctl --assess step; there is no ${name}.sign.${field})` })
    }
  }
  if (isPlainObject(platform.sign)) {
    for (const field of MAC_SIGN_UNREAD_FIELDS) {
      if (field in platform.sign) {
        delete platform.sign[field]
        changes.push({
          key: `${name}.sign.${field}`,
          description: `removed ${name}.sign.${field} (it never had an effect: electron-builder always passes ${field}: false to @electron/osx-sign)`,
        })
      }
    }
  }

  if (typeof platform.sign === "string" && !isMacSignOptOutString(platform.sign)) {
    // the v26 custom signer moves into the sign object, where the signing options next to it reach it
    if (cascade.options != null) {
      warnings.push(macSignerOverOptionsWarning(name, cascade.options))
    }
    platform.sign = { sign: platform.sign }
    changes.push({ key: `${name}.sign`, description: `moved the custom signer ${name}.sign → ${name}.sign.sign` })
  } else if (platform.sign === null && cascade.signer != null) {
    // in v26 it removed the signer of an earlier section for this one, which sign.sign: null does now
    platform.sign = { sign: null }
    changes.push({
      key: `${name}.sign`,
      description: `replaced ${name}.sign: null with ${name}.sign.sign: null (in v26 it kept ${cascade.signer} from signing the ${name} app; a bare sign: null now means skip signing)`,
    })
  } else if (isPlainObject(platform.sign) && !("sign" in platform.sign) && cascade.signer != null && cascade.signerWasBare) {
    warnings.push(macSignerOverMasOptionsWarning(name, cascade.signer))
  }
  const existingSign = platform.sign

  if (present.length === 0 && !hasSignIgnore) {
    // Only thing to fix is a semantically-flipped bare null
    if (existingSign === null) {
      delete platform.sign
      changes.push({ key: `${name}.sign`, description: `removed ${name}.sign: null (v26 "no custom signer" = v27 default; sign: null now means skip signing)` })
    }
    return
  }
  if (isMacSignOptOutString(existingSign)) {
    // everything stays, so the warning alone must not rewrite the file
    keptKeyWarnings.push(macSignOptOutNextToOptionsWarning(name, existingSign))
    return
  }

  // existingSign is null/undefined or already an object → build the merged options bag
  const signObj: Record<string, any> = existingSign != null && typeof existingSign === "object" ? { ...existingSign } : {}
  for (const f of present) {
    if (dropNullField(platform, f, name, changes)) {
      continue
    }
    signObj[f] = platform[f]
    delete platform[f]
    changes.push({ key: `${name}.${f}`, description: `moved ${name}.${f} → ${name}.sign.${f}` })
  }
  if (hasSignIgnore && !dropNullField(platform, "signIgnore", name, changes)) {
    signObj.ignore = platform.signIgnore
    delete platform.signIgnore
    changes.push({ key: `${name}.signIgnore`, description: `renamed ${name}.signIgnore → ${name}.sign.ignore` })
  }
  if (Object.keys(signObj).length > 0 || existingSign != null) {
    platform.sign = signObj
  } else if (existingSign === null) {
    // Every moved field was a dropped null — a bare `sign: null` left behind would now mean "skip signing".
    delete platform.sign
    changes.push({ key: `${name}.sign`, description: `removed ${name}.sign: null (v26 "no custom signer" = v27 default; sign: null now means skip signing)` })
  }
}

/** Drops a v26 `null` ("unset") for a field whose v27 type has no null branch. Returns true when dropped. */
function dropNullField(platform: Record<string, any>, field: string, name: string, changes: MigrationChange[]): boolean {
  if (platform[field] !== null || !MAC_NULL_MEANS_UNSET_FIELDS.has(field)) {
    return false
  }
  delete platform[field]
  changes.push({ key: `${name}.${field}`, description: `removed ${name}.${field}: null (null meant "unset" in v26; the v27 option does not accept null)` })
  return true
}

/** Moves universal-build fields from a platform config into the `universal` bag. */
function migrateMacUniversal(platform: Record<string, any>, name: string, changes: MigrationChange[]) {
  const present = MAC_UNIVERSAL_FIELDS.filter(f => f in platform)
  if (present.length === 0) {
    return
  }
  const universalObj: Record<string, any> = platform.universal != null && typeof platform.universal === "object" ? { ...platform.universal } : {}
  for (const f of present) {
    if (dropNullField(platform, f, name, changes)) {
      continue
    }
    universalObj[f] = platform[f]
    delete platform[f]
    changes.push({ key: `${name}.${f}`, description: `moved ${name}.${f} → ${name}.universal.${f}` })
  }
  if (Object.keys(universalObj).length > 0 || platform.universal != null) {
    platform.universal = universalObj
  }
}

/**
 * Moves a platform-level `asarUnpack` into that platform's `asar` object.
 *
 * v26 concatenated root and platform `asarUnpack` and always applied the root `disableSanityCheckAsar` /
 * `disableAsarIntegrity`, whatever the platform's `asar` was. v27 keeps all three inside `asar`, and a
 * platform-level `asar` replaces the root one entirely — so a platform that overrides `asar` (or gains one
 * here) gets the root values folded in to keep the v26 result.
 */
function migratePlatformAsar(c: Record<string, any>, name: string, rootAsarValue: any, rootFlatAsar: Record<string, any>, changes: MigrationChange[]) {
  const platform: Record<string, any> = c[name]
  const hasUnpack = "asarUnpack" in platform
  const own = platform.asar

  if (own == null) {
    // Inherits the root asar — only needs an override of its own to carry a platform asarUnpack.
    if (!hasUnpack) {
      return
    }
    if (rootAsarValue === false) {
      delete platform.asarUnpack
      changes.push({ key: `${name}.asarUnpack`, description: `removed ${name}.asarUnpack (no effect with asar: false)` })
      return
    }
    const next: Record<string, any> = isPlainObject(c.asar) ? { ...c.asar } : {}
    next.unpack = mergeAsarUnpack(next.unpack, platform.asarUnpack)
    platform.asar = next
    delete platform.asarUnpack
    changes.push({
      key: `${name}.asarUnpack`,
      description: `moved ${name}.asarUnpack → ${name}.asar.unpack (merged with the root asar options, since a platform-level asar replaces the root one)`,
    })
    return
  }

  if (own === false) {
    if (hasUnpack) {
      delete platform.asarUnpack
      changes.push({ key: `${name}.asarUnpack`, description: `removed ${name}.asarUnpack (no effect with ${name}.asar: false)` })
    }
    return
  }

  // own is true or an AsarOptions object: fold the v26 root-level options (and the platform asarUnpack) into it.
  const next: Record<string, any> = isPlainObject(own) ? { ...own } : {}
  const folded: string[] = []
  if (rootFlatAsar.unpack != null || hasUnpack) {
    // v26 order: root patterns first, then the platform's own.
    let unpack: string | string[] | undefined = undefined
    for (const it of [rootFlatAsar.unpack, next.unpack, hasUnpack ? platform.asarUnpack : undefined]) {
      if (it != null) {
        unpack = mergeAsarUnpack(unpack, it)
      }
    }
    if (unpack !== undefined) {
      next.unpack = unpack
      folded.push("unpack")
    }
  }
  for (const key of ["disableSanityCheck", "disableIntegrity"] as const) {
    if (key in rootFlatAsar && !(key in next)) {
      next[key] = rootFlatAsar[key]
      folded.push(key)
    }
  }
  if (hasUnpack) {
    delete platform.asarUnpack
  }
  if (folded.length === 0) {
    return
  }
  platform.asar = next
  changes.push({
    key: hasUnpack ? `${name}.asarUnpack` : `${name}.asar`,
    description: `folded ${folded.map(k => `asar.${k}`).join(", ")} into ${name}.asar (a platform-level asar replaces the root one in v27, so the v26 root-level values are copied)`,
  })
}

/** `toolsets.appimage` pins whose bundle is no longer published, and the pin migrate-schema rewrites each to. */
export const RETIRED_APPIMAGE_PINS: ReadonlyMap<string, { readonly replacement: string; readonly reason: string }> = new Map([
  ["1.0.2", { replacement: "1.0.3", reason: "1.0.2 is no longer offered; 1.0.3 is the same runtime with the #9598 fix" }],
  ["1.2.0", { replacement: "1.2.1", reason: "1.2.0 was withdrawn for missing license files; 1.2.1 is its license-corrected re-release" }],
])

/** The change note for rewriting the retired `toolsets.appimage` pin `pin`. */
export function retiredAppImagePinDescription(pin: string, retired: { readonly replacement: string; readonly reason: string }): string {
  return `replaced toolsets.appimage: "${pin}" with "${retired.replacement}" (${retired.reason})`
}

/** Removes `null` toolset values (rejected by the v27 schema) and remaps pins to bundles that are no longer published. */
function migrateToolsets(toolsets: Record<string, any>, changes: MigrationChange[]) {
  for (const [key, value] of Object.entries(toolsets)) {
    // toolsets.executables is not a bundle, and null is valid for it (the default locations)
    if (value === null && key !== "executables") {
      delete toolsets[key]
      changes.push({
        key: `toolsets.${key}`,
        description: `removed toolsets.${key}: null (v27 rejects null; unset resolves to "latest", the newest bundle — pin "0.0.0" to keep the legacy bundle v26 used)`,
      })
    }
  }
  const retired = typeof toolsets.appimage === "string" ? RETIRED_APPIMAGE_PINS.get(toolsets.appimage) : undefined
  if (retired != null) {
    changes.push({ key: "toolsets.appimage", description: retiredAppImagePinDescription(toolsets.appimage, retired) })
    toolsets.appimage = retired.replacement
  }
}

/**
 * Renames `electronDownload` → `electronGet` and reshapes it to ElectronGetOptions.
 * `mirror` → `mirrorOptions.mirror`, `isVerifyChecksum: false` → `unsafelyDisableChecksums: true`.
 * Fields with no v5 equivalent are dropped with a warning.
 */
function migrateElectronDownload(c: Record<string, any>, sourceKey: "electronDownload" | "electronGet", changes: MigrationChange[], warnings: string[]) {
  const old = c[sourceKey]
  delete c[sourceKey]

  if (old == null || typeof old !== "object") {
    changes.push({ key: "electronDownload", description: "renamed electronDownload → electronGet" })
    if (old != null && c.electronGet == null) {
      c.electronGet = old
    }
    return
  }

  const next: Record<string, any> = {}
  if ("mirror" in old && old.mirror != null) {
    next.mirrorOptions = { ...(next.mirrorOptions ?? {}), mirror: old.mirror }
  }
  if (old.isVerifyChecksum === false) {
    next.unsafelyDisableChecksums = true
  }
  // Carry over any already-valid ElectronGetOptions fields (mirrorOptions, unsafelyDisableChecksums, force, etc.)
  for (const [k, v] of Object.entries(old)) {
    if (k !== "mirror" && k !== "isVerifyChecksum" && !ELECTRON_DOWNLOAD_DROPPED.includes(k as any)) {
      next[k] = v
    }
  }

  const dropped = ELECTRON_DOWNLOAD_DROPPED.filter(k => k in old)
  if (dropped.length > 0) {
    warnings.push(
      `electronGet (formerly electronDownload) dropped [${dropped.join(", ")}] — these have no equivalent in @electron/get v5. Set a mirror via electronGet.mirrorOptions if needed.`
    )
  }

  // An electronGet that already exists is the v27 intent: fold the legacy values in underneath it, never over it.
  const existing = sourceKey === "electronDownload" && isPlainObject(c.electronGet) ? c.electronGet : null
  if (existing != null) {
    const conflicts: string[] = []
    let mergedMirrorOptions: Record<string, any> | undefined
    for (const [k, v] of Object.entries(next)) {
      if (k === "mirrorOptions" && isPlainObject(v) && isPlainObject(existing.mirrorOptions)) {
        const own = existing.mirrorOptions
        conflicts.push(
          ...Object.keys(v)
            .filter(m => m in own && JSON.stringify(own[m]) !== JSON.stringify(v[m]))
            .map(m => `mirrorOptions.${m}`)
        )
        mergedMirrorOptions = { ...v, ...own }
      } else if (k in existing && JSON.stringify(existing[k]) !== JSON.stringify(v)) {
        conflicts.push(k)
      }
    }
    Object.assign(next, existing, mergedMirrorOptions != null ? { mirrorOptions: mergedMirrorOptions } : {})
    if (conflicts.length > 0) {
      warnings.push(
        `Both electronDownload and electronGet set [${conflicts.join(", ")}]; kept the existing electronGet values and dropped the electronDownload ones. Verify the merged electronGet.`
      )
    }
  }

  c.electronGet = next
  changes.push({
    key: sourceKey,
    description:
      sourceKey === "electronDownload"
        ? "renamed electronDownload → electronGet (mirror → mirrorOptions.mirror; isVerifyChecksum → unsafelyDisableChecksums)"
        : "reshaped electronGet to the v27 options (mirror → mirrorOptions.mirror; isVerifyChecksum → unsafelyDisableChecksums)",
  })
}

/** Keys of the v26 `electronDownload` shape that are not valid v27 `electronGet` keys. */
export function isLegacyElectronDownloadKey(key: string): boolean {
  return key === "mirror" || key === "isVerifyChecksum" || (ELECTRON_DOWNLOAD_DROPPED as readonly string[]).includes(key)
}

/** What both migrators tell a user whose section (`prefix`: "" for the root, or `mac.` / `win.` / `linux.`) sets both `updateManifest` and `updateManifestSigning`. */
export function updateManifestBothSetWarning(prefix: string): string {
  return (
    `${prefix}updateManifest and ${prefix}updateManifestSigning are both set, so neither was changed: merge ${prefix}updateManifest into ` +
    `${prefix}updateManifestSigning and remove it (the build rejects ${prefix}updateManifest). See https://www.electron.build/docs/migration/v27-config-changes#updatemanifest-updatemanifestsigning`
  )
}

function mergeAsarUnpack(existing: string | string[] | undefined, incoming: string | string[]): string | string[] {
  if (existing == null) {
    return incoming
  }
  const arr = (Array.isArray(existing) ? existing : [existing]).concat(Array.isArray(incoming) ? incoming : [incoming])
  return arr.length === 1 ? arr[0] : arr
}

/**
 * Rewrites the publish entries at `label` (`publish` or `<section>.publish`): GitHub and GitLab `vPrefixedTagName` → `tagNamePrefix`, and the
 * fields electron-builder writes into app-update.yml itself are removed on every provider. `publisherName` is kept with a warning: it was
 * honored, and only the user can tell which `win.sign.publisherName` it belongs in.
 */
function migratePublishEntries(parent: Record<string, any>, label: string, changes: MigrationChange[], warnings: string[], keptKeyWarnings: string[]) {
  const entries: any[] = Array.isArray(parent.publish) ? parent.publish : [parent.publish]
  let changed = false
  for (const entry of entries) {
    if (!isPlainObject(entry)) {
      continue
    }
    for (const field of Object.keys(PUBLISH_MANAGED_OPTIONS)) {
      if (!(field in entry)) {
        continue
      }
      const warning = managedPublishOptionWarning(label, field)
      if (field === "publisherName") {
        if (warning != null && !keptKeyWarnings.includes(warning)) {
          keptKeyWarnings.push(warning)
        }
        continue
      }
      delete entry[field]
      if (!changes.some(it => it.key === `${label}[].${field}`)) {
        changes.push({ key: `${label}[].${field}`, description: `removed ${label}[].${field} (electron-builder writes it into app-update.yml itself)` })
      }
      if (warning != null && !warnings.includes(warning)) {
        warnings.push(warning)
      }
    }
    if (entry.provider === "gitlab") {
      if ("vPrefixedTagName" in entry) {
        // v26 tagged "<version>" when vPrefixedTagName read as false (v26Boolean), else "v<version>": the tagNamePrefix default.
        // v26 rejected a tagNamePrefix on GitLab, so one set next to it was written for v27 and is kept.
        if ("tagNamePrefix" in entry) {
          const warning = gitlabTagNamePrefixKeptWarning(label)
          if (!warnings.includes(warning)) {
            warnings.push(warning)
          }
        } else if (v26Boolean(entry.vPrefixedTagName) === false) {
          entry.tagNamePrefix = ""
        } else if (!Array.isArray(parent.publish) && Object.prototype.hasOwnProperty.call(V26_MERGED_TARGET_PUBLISH, label.slice(0, -".publish".length))) {
          // v26 merged the publish object of such a target over the inherited one, so a true here overrode an inherited false: without the
          // explicit default, the build's replaced-publish check reports the inherited tagNamePrefix as dropped. Two lists were concatenated
          // instead, so a list entry is removed as elsewhere: an explicit "v" would no longer equal an inherited entry without one.
          entry.tagNamePrefix = "v"
        }
        delete entry.vPrefixedTagName
        changed = true
      }
      continue
    }
    if (entry.provider !== "github") {
      continue
    }
    if ("vPrefixedTagName" in entry) {
      // v26 githubTagPrefix(): a non-empty tagNamePrefix won; otherwise vPrefixedTagName (default true, read as v26Boolean) chose "v" or "".
      entry.tagNamePrefix = entry.tagNamePrefix ? entry.tagNamePrefix : v26Boolean(entry.vPrefixedTagName) === false ? "" : "v"
      delete entry.vPrefixedTagName
      changed = true
    } else if (entry.tagNamePrefix === "") {
      // v26 ignored an empty tagNamePrefix and still tagged "v1.2.3"; v27 honors it and would tag "1.2.3".
      entry.tagNamePrefix = "v"
      changed = true
      warnings.push(
        'A GitHub publish entry set tagNamePrefix: "". v26 ignored an empty prefix and tagged releases "v<version>"; v27 honors it. ' +
          'It was rewritten to tagNamePrefix: "v" to keep your existing tag names — set it back to "" if you want unprefixed tags from now on.'
      )
    }
  }
  if (changed) {
    changes.push({ key: `${label}[].vPrefixedTagName`, description: "replaced vPrefixedTagName with tagNamePrefix on GitHub and GitLab publish entries" })
  }
}

/** What both migrators tell a user whose GitLab publish entry at `label` sets both vPrefixedTagName and tagNamePrefix (valid in no version). */
export function gitlabTagNamePrefixKeptWarning(label: string): string {
  return (
    `A GitLab publish entry in ${label} set both vPrefixedTagName and tagNamePrefix; vPrefixedTagName was removed and tagNamePrefix kept. ` +
    'v26 tagged GitLab releases "<version>" with vPrefixedTagName: false and "v<version>" otherwise: check that tagNamePrefix gives the tags you want.'
  )
}

/** What both migrators tell a user whose publish entry at `label` sets a field electron-builder writes into app-update.yml itself. */
export function managedPublishOptionWarning(label: string, field: string): string | null {
  switch (field) {
    case "verifyUpdateCodeSignature":
      return `${label}.verifyUpdateCodeSignature was removed: it never had an effect. To opt out of update signature verification, set win.verifyUpdateCodeSignature: false.`
    case "updateManifestPublicKey":
      return `${label}.updateManifestPublicKey was removed: it never had an effect. To pin the update-manifest trust list, set updateManifestSigning.publicKey.`
    case "publisherName":
      return (
        `${label}.publisherName no longer overrides the Windows publisher name in v27, and the build rejects it (on a custom provider, when it is the first one): move it to win.sign.publisherName ` +
        '(adding type: "signtool" when win.sign is unset), or remove it from a macOS or Linux section, where it never had an effect.'
      )
    default:
      return null
  }
}

// snap bases recognized by the v27 snapcraft config. "custom" uses an inline/path yaml
// and must be moved verbatim rather than nested under a per-base sub-key.
export const SNAP_BASES = new Set(["core18", "core20", "core22", "core24", "custom"])

/**
 * Migrates the removed flat `snap` config into the v27 `snapcraft` shape:
 *   { snapcraft: { base, [base]: { ...rest } } }
 * When no `base` is present, defaults to "core20" (the v27 1-to-1 migration target) and warns.
 */
function migrateSnap(c: Record<string, any>, changes: MigrationChange[], warnings: string[]) {
  const snap = c.snap
  delete c.snap

  if (snap == null || typeof snap !== "object") {
    changes.push({ key: "snap", description: "removed empty snap config (use snapcraft in v27)" })
    return
  }

  if (c.snapcraft != null) {
    // v26.12 and later ignored snap when snapcraft was set (and warned at every build), so merging it in would change the snap
    changes.push({ key: "snap", description: "removed snap (it was ignored next to snapcraft)" })
    warnings.push(snapNextToSnapcraftWarning(Object.keys(snap)))
    return
  }

  const snapcraft: Record<string, any> = {}
  const rest: Record<string, any> = { ...snap }
  let base: string | undefined = rest.base
  delete rest.base

  if (base === "custom") {
    // base: custom carries yamlPath / inline yaml — move verbatim, no per-base nesting
    snapcraft.base = "custom"
    Object.assign(snapcraft, rest)
    c.snapcraft = snapcraft
    changes.push({ key: "snap", description: "moved snap (base: custom) → snapcraft verbatim" })
    return
  }

  let assumed = false
  if (base == null || !SNAP_BASES.has(base)) {
    if (base != null) {
      warnings.push(`snap config had an unrecognized base "${base}"; assumed "core20". Verify the snapcraft.base value (core18/core20/core22/core24/custom).`)
    }
    base = "core20"
    assumed = true
  }

  if (base === "core24") {
    const unsupported = SNAP_CORE24_UNSUPPORTED.filter(k => k in rest)
    for (const k of unsupported) {
      delete rest[k]
    }
    if (unsupported.length > 0) {
      warnings.push(
        `snap config set [${unsupported.join(", ")}], which the v27 snapcraft.core24 options do not support (core24 builds with the snapcraft CLI directly); they were dropped.`
      )
    }
  }

  snapcraft.base = base
  // the snap's file name and upload target are read from snapcraft itself, never per base
  for (const key of SNAP_CORE_TARGET_OPTION_KEYS) {
    if (key in rest) {
      snapcraft[key] = rest[key]
      delete rest[key]
    }
  }
  snapcraft[base] = rest
  c.snapcraft = snapcraft
  changes.push({ key: "snap", description: `moved snap → snapcraft.${base}${assumed ? " (base defaulted to core20)" : ""}` })
  if (assumed && warnings.every(w => !w.includes("unrecognized base"))) {
    warnings.push('snap config had no "base"; assumed "core20" for snapcraft. Verify and adjust the base if needed (core18/core20/core22/core24).')
  }
}

/** What both migrators tell a user whose v26 `snap` is dropped because `snapcraft` is set. */
export function snapNextToSnapcraftWarning(keys: ReadonlyArray<string>): string {
  return (
    `snap was removed: snapcraft is set, so v26 ignored snap${keys.length > 0 ? ` (it set [${keys.join(", ")}])` : ""}. ` +
    "If you need any of its options, set them under snapcraft (publish / artifactName on snapcraft itself, the others under snapcraft.<base>)."
  )
}

/**
 * Moves a `snapcraft.<core>.publish` / `artifactName` (written there by the v27 alpha migrator, and never read) to `snapcraft` itself
 * when `<core>` is the selected base and `snapcraft` does not set the key, and removes it otherwise. Both warn: a moved value now takes
 * effect, and a removed one was never used.
 */
function migrateSnapcraftCoreTargetOptions(snapcraft: Record<string, any>, changes: MigrationChange[], warnings: string[]): void {
  for (const core of SNAP_CORE_KEYS) {
    const options = snapcraft[core]
    if (!isPlainObject(options)) {
      continue
    }
    for (const key of SNAP_CORE_TARGET_OPTION_KEYS) {
      if (!(key in options)) {
        continue
      }
      const value = options[key]
      delete options[key]
      const path = `snapcraft.${core}.${key}`
      if (core === snapcraft.base && snapcraft[key] === undefined) {
        snapcraft[key] = value
        changes.push({ key: path, description: `moved ${path} → snapcraft.${key}` })
        warnings.push(snapcraftCoreTargetOptionWarning(path, key, true))
      } else {
        changes.push({ key: path, description: `removed ${path} (it was never read)` })
        warnings.push(snapcraftCoreTargetOptionWarning(path, key, false))
      }
    }
  }
}

/** What both migrators tell a user whose `snapcraft.<core>.publish` / `artifactName` is moved (`moved`) or removed. */
export function snapcraftCoreTargetOptionWarning(path: string, key: string, moved: boolean): string {
  const what = key === "publish" ? "upload target" : "file name"
  return moved
    ? `${path} was never read; it was moved to snapcraft.${key}, where it now sets the snap's ${what}. Check that this is what you want.`
    : `${path} was never read and was removed: the snap's ${what} comes from snapcraft.${key}.`
}

/**
 * Replaces the `snapcraft.core24` build switches (`useLXD`, `useMultipass`, `useDestructiveMode`, `remoteBuild.enabled`) with the `buildEnvironment`
 * the switch that is on selects, and removes the switches that are off (`false` / `null` had no effect). An existing `buildEnvironment` is
 * kept: it is the newer intent. More than one switch on, or a value other than `true`, `false` or `null`, leaves them all for the guard,
 * with a warning that does not rewrite the file.
 */
function migrateCore24BuildEnvironment(core24: Record<string, any>, changes: MigrationChange[], warnings: string[], keptKeyWarnings: string[]): void {
  const remoteBuild = isPlainObject(core24.remoteBuild) ? core24.remoteBuild : null
  // in v26's order: a remote build won, then the host, LXD and Multipass
  const switches = [
    ...(remoteBuild != null && "enabled" in remoteBuild ? [{ path: "remoteBuild.enabled", value: remoteBuild.enabled, environment: "remote" }] : []),
    ...Object.entries(CORE24_BUILD_ENVIRONMENT_FLAGS)
      .filter(([key]) => key in core24)
      .map(([key, environment]) => ({ path: key, value: core24[key], environment })),
  ]
  if (switches.length === 0) {
    return
  }
  const unread = switches.filter(it => it.value !== true && it.value !== false && it.value !== null)
  const on = switches.filter(it => it.value === true)
  if (unread.length > 0 || on.length > 1) {
    keptKeyWarnings.push(unread.length > 0 ? core24BuildSwitchesUnreadWarning(unread.map(it => it.path)) : core24BuildSwitchesConflictWarning(on.map(it => it.path)))
    return
  }

  const selected = on.length === 1 ? on[0] : null
  const written = selected != null && !("buildEnvironment" in core24)
  if (selected != null && written) {
    core24.buildEnvironment = selected.environment
  } else if (selected != null && core24.buildEnvironment !== selected.environment) {
    warnings.push(core24BuildEnvironmentKeptWarning(JSON.stringify(core24.buildEnvironment), selected.path, selected.environment))
  }
  for (const { path, value, environment } of switches) {
    if (remoteBuild != null && path === "remoteBuild.enabled") {
      delete remoteBuild.enabled
    } else {
      delete core24[path]
    }
    changes.push(core24BuildSwitchChange(path, String(value), value !== true ? "off" : written ? environment : "kept"))
  }
  if (remoteBuild != null && Object.keys(remoteBuild).length === 0) {
    delete core24.remoteBuild
  }
}

/**
 * The change both migrators record for the `snapcraft.core24` build switch at `path` (below core24), set to `valueText`: `"off"` for a switch that
 * had no effect, `"kept"` when it was on next to an existing `buildEnvironment`, or the `buildEnvironment` it was replaced by.
 */
export function core24BuildSwitchChange(path: string, valueText: string, outcome: string): MigrationChange {
  const key = `snapcraft.core24.${path}`
  switch (outcome) {
    case "off":
      return { key, description: `removed ${key}: ${valueText} (it had no effect)` }
    case "kept":
      return { key, description: `removed ${key} (snapcraft.core24.buildEnvironment is set)` }
    default:
      return { key, description: `replaced ${key}: true → snapcraft.core24.buildEnvironment: "${outcome}"` }
  }
}

/** What both migrators tell a user whose `snapcraft.core24` turns on more than one build switch (`on`: their paths below core24, in v26's order). */
export function core24BuildSwitchesConflictWarning(on: ReadonlyArray<string>): string {
  const first = on[0] === "remoteBuild.enabled" ? "remote" : Object.entries(CORE24_BUILD_ENVIRONMENT_FLAGS).find(([key]) => key === on[0])?.[1]
  return (
    `snapcraft.core24 turns on more than one build switch ([${on.map(it => `snapcraft.core24.${it}`).join(", ")}]), so they were left in place: ` +
    'set snapcraft.core24.buildEnvironment to one value ("lxd", "multipass", "host" or "remote") and remove them. ' +
    (on.includes("remoteBuild.enabled") && on.includes("useDestructiveMode")
      ? "On Linux, v26 ran a remote build with a snapcraft.yaml generated for a host build (without the gnome extension), which v27 cannot express. "
      : `On Linux, v26 built with snapcraft.core24.${on[0]}, which is buildEnvironment "${first}". `) +
    "See https://www.electron.build/docs/migration/v27-config-changes#snapcraftcore24-buildenvironment"
  )
}

/**
 * What both migrators tell a user whose `snapcraft.core24` sets `buildEnvironment` (`existing`: its value as JSON, or its source text) next to the
 * build switch at `path` that selects another `environment`.
 */
export function core24BuildEnvironmentKeptWarning(existing: string, path: string, environment: string): string {
  return (
    `snapcraft.core24 sets both buildEnvironment: ${existing} and ${path}: true, which selects "${environment}"; buildEnvironment was kept and ${path} removed. ` +
    `Check that ${existing} is the build environment you want.`
  )
}

/** What both migrators tell a user whose `snapcraft.core24` build switches (`paths` below core24) they cannot read; the build rejects them. */
export function core24BuildSwitchesUnreadWarning(paths: ReadonlyArray<string>): string {
  return (
    `[${paths.map(it => `snapcraft.core24.${it}`).join(", ")}] were left in place: the migrator cannot read which build environment they select ` +
    "(a value other than true, false or null, or one set through a variable or a spread). " +
    'Replace them with snapcraft.core24.buildEnvironment ("lxd", "multipass", "host" or "remote"). ' +
    "See https://www.electron.build/docs/migration/v27-config-changes#snapcraftcore24-buildenvironment"
  )
}

// ─── File I/O ─────────────────────────────────────────────────────────────────

type ConfigFormat = "json" | "json5" | "yaml" | "toml" | "js"

function formatFromPath(p: string): ConfigFormat {
  const ext = path.extname(p).toLowerCase()
  if (ext === ".json") {
    return "json"
  }
  if (ext === ".json5") {
    return "json5"
  }
  if (ext === ".yml" || ext === ".yaml") {
    return "yaml"
  }
  if (ext === ".toml") {
    return "toml"
  }
  return "js"
}

function serializeConfig(content: Record<string, any>, format: ConfigFormat, originalText: string): string {
  if (format === "yaml") {
    const yaml = _require("js-yaml") as { dump(obj: unknown, opts?: { lineWidth?: number; quotingType?: string; forceQuotes?: boolean }): string }
    return yaml.dump(content, { lineWidth: 120, quotingType: '"', forceQuotes: false })
  }
  // JSON and JSON5: detect original indent level
  const indentMatch = originalText.match(/^{\s*\n( +)/m)
  const indent = indentMatch ? indentMatch[1].length : 2
  return JSON.stringify(content, null, indent) + "\n"
}

interface FoundConfig {
  /** Absolute path to the file, or null when config is in package.json */
  readonly configFile: string | null
  readonly isPackageJson: boolean
  readonly format: ConfigFormat
  readonly rawText: string
  readonly parsed: Record<string, any>
  /** package.json only: a root-level `directories` key was folded into `build.directories` */
  readonly rootDirectoriesMoved?: boolean
}

/** Extensions of the `electron-builder.<ext>` files auto-detected when `--config` is omitted, in lookup order. */
const CONFIG_FILE_EXTENSIONS = ["yml", "yaml", "json", "json5", "toml", "js", "cjs", "mjs", "ts"]

async function findAndLoadConfig(projectDir: string, explicitConfigPath?: string | null): Promise<FoundConfig | null> {
  if (explicitConfigPath != null) {
    const abs = path.resolve(projectDir, explicitConfigPath)
    const text = await readFileSafe(abs)
    if (text == null) {
      log.error({ configFile: abs }, "config file not found")
      return null
    }
    const format = formatFromPath(abs)
    return { configFile: abs, isPackageJson: false, format, rawText: text, parsed: parseConfig(text, format) }
  }

  // Check package.json build key first
  const pkgPath = path.join(projectDir, "package.json")
  const pkgText = await readFileSafe(pkgPath)
  if (pkgText != null) {
    const pkg = JSON.parse(pkgText)
    if (pkg.build != null && typeof pkg.build === "object") {
      const build: Record<string, any> = pkg.build
      let rootDirectoriesMoved = false
      if (pkg.directories != null && build.directories == null) {
        build.directories = pkg.directories
        rootDirectoriesMoved = true
      }
      return { configFile: null, isPackageJson: true, format: "json", rawText: pkgText, parsed: build, rootDirectoriesMoved }
    }
  }

  // Standalone config files
  const candidates = CONFIG_FILE_EXTENSIONS.map(ext => path.join(projectDir, `electron-builder.${ext}`))
  for (const candidate of candidates) {
    const text = await readFileSafe(candidate)
    if (text != null) {
      const format = formatFromPath(candidate)
      return { configFile: candidate, isPackageJson: false, format, rawText: text, parsed: parseConfig(text, format) }
    }
  }

  return null
}

function parseConfig(text: string, format: ConfigFormat): Record<string, any> {
  if (format === "js") {
    // Programmatic configs (JS/TS/MJS/CJS) can't be parsed; migrateSchema will bail with manual steps
    return {}
  }
  if (format === "yaml") {
    const yaml = _require("js-yaml") as { load(text: string): unknown }
    return yaml.load(text) as Record<string, any>
  }
  if (format === "json5") {
    const json5 = _require("json5") as { parse(text: string): any }
    return json5.parse(text)
  }
  if (format === "toml") {
    const toml = _require("toml") as { parse(text: string): any }
    return toml.parse(text)
  }
  return JSON.parse(text)
}

async function readFileSafe(p: string): Promise<string | null> {
  return orNullIfFileNotExist(fs.readFile(p, "utf8"))
}

async function writeBackConfig(found: FoundConfig, migrated: Record<string, any>, projectDir: string): Promise<string> {
  if (found.isPackageJson) {
    const pkgPath = path.join(projectDir, "package.json")
    const pkg = JSON.parse(found.rawText)
    pkg.build = migrated
    if (found.rootDirectoriesMoved) {
      delete pkg.directories
    }
    const indentMatch = found.rawText.match(/^{\s*\n( +)/m)
    const indent = indentMatch ? indentMatch[1].length : 2
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, indent) + "\n", "utf8")
    return "package.json"
  }
  const serialized = serializeConfig(migrated, found.format, found.rawText)
  await fs.writeFile(found.configFile!, serialized, "utf8")
  return path.relative(projectDir, found.configFile!)
}

// ─── CLI command ──────────────────────────────────────────────────────────────

export function configureMigrateSchemaCommand(yargs: Argv): Argv {
  return yargs
    .option("config", {
      alias: "c",
      type: "string",
      description: "Path to config file (auto-detected if omitted)",
    })
    .option("project-dir", {
      type: "string",
      description: "Project root directory",
      default: process.cwd(),
    })
    .option("dry-run", {
      alias: "n",
      type: "boolean",
      default: false,
      description: "Print what would change without writing",
    })
}

export async function migrateSchema(args: any): Promise<void> {
  const projectDir: string = path.resolve((args["project-dir"] as string | undefined) ?? process.cwd())
  const configPath: string | null = (args.config as string | undefined) ?? null
  const dryRun: boolean = (args["dry-run"] as boolean | undefined) ?? false

  const found = await findAndLoadConfig(projectDir, configPath)
  if (found == null) {
    // A missing --config file was already reported by findAndLoadConfig.
    if (configPath == null) {
      log.error(
        { projectDir },
        `no config found — checked the "build" key of package.json and electron-builder.{${CONFIG_FILE_EXTENSIONS.join(",")}}. ` +
          "If your config file has another name (e.g. one you pass to `electron-builder --config`), run `electron-builder migrate-schema --config <path>`"
      )
    }
    process.exit(1)
  }

  const location = found.isPackageJson ? 'package.json ("build" key)' : path.relative(projectDir, found.configFile!)
  log.info({ file: location }, "loaded config")

  // Programmatic formats (JS/TS) are rewritten surgically via an AST-located text codemod.
  if (found.format === "js") {
    await migrateProgrammaticConfigFile(found, location, dryRun)
    return
  }

  // TOML: can parse but not serialize (toml lib is read-only)
  const isToml = found.format === "toml"

  const result = migrateConfig(found.parsed)
  const { migrated, warnings, advisories } = result
  const changes = [...result.changes]
  if (found.rootDirectoriesMoved) {
    changes.push({ key: "directories", description: "moved package.json root-level directories → build.directories" })
  }
  const modified = result.modified || found.rootDirectoriesMoved === true

  for (const change of changes) {
    log.info({ key: change.key }, change.description)
  }
  for (const warning of warnings) {
    log.warn(null, warning)
  }
  // Advisories are informational and surface even when nothing changed; they never cause a rewrite.
  for (const advisory of advisories) {
    log.warn(null, advisory)
  }

  if (!modified) {
    // A kept key (e.g. a customNsisBinary with a url) leaves the config unmodified but is not "up to date".
    if (advisories.length === 0 && warnings.length === 0) {
      log.info(null, "config is already up to date — no changes needed")
    }
    return
  }

  if (isToml) {
    log.warn({ file: location }, "TOML configs cannot be automatically rewritten; apply the changes above manually")
    return
  }

  if (dryRun) {
    log.info(null, "dry run — no files written")
    return
  }

  const written = await writeBackConfig(found, migrated, projectDir)
  log.info({ file: written }, "wrote migrated config")

  if (found.format === "json5") {
    log.warn(null, "JSON5 was re-serialized as JSON — comments were not preserved")
  }
}

async function migrateProgrammaticConfigFile(found: FoundConfig, location: string, dryRun: boolean): Promise<void> {
  if (loadTypeScript() == null) {
    log.warn(
      { file: location },
      "auto-migration of programmatic configs requires the 'typescript' package, which was not found. Install it (e.g. `npm i -D typescript`) or apply these changes manually:"
    )
    printManualSteps()
    return
  }

  const result = migrateProgrammaticSource(found.rawText, found.configFile!)

  const printAdvisories = () => {
    for (const advisory of result.advisories) {
      log.warn(null, advisory)
    }
  }

  if (result.status === "unsupported") {
    log.warn({ file: location, reason: result.unsupportedReason }, "this programmatic config could not be auto-migrated; apply these changes manually:")
    printManualSteps()
    printAdvisories()
    return
  }

  if (result.status === "no-op") {
    // A no-op can still carry warnings for keys that cannot be rewritten (e.g. customSquirrelVendorDir).
    for (const warning of result.warnings) {
      log.warn(null, warning)
    }
    if (result.advisories.length === 0 && result.warnings.length === 0) {
      log.info(null, "config is already up to date — no changes needed")
    }
    printAdvisories()
    return
  }

  for (const change of result.changes) {
    log.info({ key: change.key }, change.description)
  }
  for (const warning of result.warnings) {
    log.warn(null, warning)
  }
  printAdvisories()

  if (dryRun) {
    log.info(null, "dry run — no files written")
    return
  }

  await fs.writeFile(found.configFile!, result.code, "utf8")
  log.info({ file: location }, "wrote migrated config")
}

function printManualSteps() {
  const steps = [
    "",
    "• Remove electronCompile",
    "• Remove framework, nodeVersion, launchUiVersion",
    "• Remove the root-level target (it never selected a target; set mac.target / win.target / linux.target)",
    "• Remove msiWrapped.oneClick / perMachine / runAfterFinish / createDesktopShortcut / createStartMenuShortcut / menuCategory / shortcutName (the wrapped installer uses nsis.*) and msix.electronUpdaterAware",
    "• Rename npmSkipBuildFromSource → buildDependenciesFromSource",
    '• Move buildDependenciesFromSource, nodeGypRebuild, npmRebuild, nativeRebuilder into nativeModules (rename nativeRebuilder → rebuildMode; drop a "legacy" value)',
    "• Rename asar-unpack / asar-unpack-dir / asar.unpackDir → asarUnpack; then move asarUnpack → asar.unpack",
    "• Move mac/mas/masDev/win/linux asarUnpack → <platform>.asar.unpack (a platform-level asar replaces the root one, so copy the root asar options into it)",
    "• Move disableSanityCheckAsar → asar.disableSanityCheck",
    "• Move disableAsarIntegrity → asar.disableIntegrity",
    "• Replace asar: true with an asar object (e.g. asar: {} or omit entirely - asar is enabled by default)",
    "• Remove appImage.systemIntegration",
    "• Remove linux.syncDesktopName (the installed .desktop filename is always synced from desktopName in v27)",
    "• Remove deb/rpm/pacman/freebsd/p5p/apk icon, freebsd/p5p/apk compression, and appImage/flatpak/snapcraft.<base> synopsis (they never had an effect)",
    "• Rename snap → snapcraft; nest options under a base-named sub-key (default base: core20), except publish / artifactName, which go on snapcraft itself; remove a snap next to an existing snapcraft (v26.12 and later ignored it); move snapcraft.<base>.publish / artifactName to snapcraft",
    '• Replace snapcraft.core24 useLXD / useMultipass / useDestructiveMode / remoteBuild.enabled: true with snapcraft.core24.buildEnvironment: "lxd" / "multipass" / "host" / "remote" (one value; remove the switches set to false or null)',
    "• Replace vPrefixedTagName with tagNamePrefix on GitHub and GitLab publish entries (false → tagNamePrefix: '', otherwise remove it: 'v' is the default prefix, or set tagNamePrefix: 'v' in a target's publish object that v26 merged over the inherited one, e.g. deb.publish); a GitHub empty tagNamePrefix is now honored",
    "• Remove updaterCacheDirName, verifyUpdateCodeSignature and updateManifestPublicKey from publish entries (electron-builder writes them into app-update.yml); move a publish publisherName to win.sign.publisherName",
    "• Move win.signtoolOptions → win.sign: { type: 'signtool', ...fields }",
    "• Move win.azureSignOptions → win.sign: { type: 'azure', ...fields }; move untyped extra keys into win.sign.additionalMetadata",
    "• Remove win.signAndEditExecutable (resource editing always runs in v27); replace win.signExecutable: false with win.sign: false",
    "• Move helper-bundle-id → mac.helperBundleId",
    "• Replace squirrelWindows.noMsi with squirrelWindows.msi (inverted)",
    "• Replace squirrelWindows.customSquirrelVendorDir with a toolsets.squirrel custom bundle (it must contain an electron-winstaller/vendor/ subtree)",
    "• Move nsis/nsisWeb customNsisBinary.debugLogging → installerDebugLogging (it needs a log-enabled NSIS: the default toolsets.nsis or a log-enabled custom bundle); remove customNsisBinary and customNsisResources, replacing a custom url/checksum with a toolsets.nsis custom bundle (the checksum carries over; the bundle must also contain the NSIS plugins)",
    "• Move mac/mas/masDev signing fields (identity, entitlements, entitlementsInherit, entitlementsLoginHelper, hardenedRuntime, type, requirements, timestamp, binaries, strictVerify, preAutoEntitlements, provisioningProfile, additionalArguments) into the `sign` object; rename signIgnore → sign.ignore; remove gatekeeperAssess and sign.identityValidation",
    "• Move a custom mac/mas/masDev signer (`sign: '<module>'` or a function) into `sign.sign`, next to the options it receives; where a v26 `mas.sign: null` (or masDev) kept a mac signer from signing that app, set `sign.sign: null` there instead",
    "• Move mac/mas/masDev mergeASARs / singleArchFiles / x64ArchFiles into the `universal` object",
    "• Move the root cscLink / cscKeyPassword into both mac and win (the root value applied to both); remove linux.cscLink / linux.cscKeyPassword",
    "• Remove mac/mas/masDev helperEHBundleId / helperNPBundleId (Electron 4 and later ship no such helper)",
    "• Remove from mas/masDev the options Mac App Store builds never read (target, icon, notarize, publish, cscLink, updateManifest, …); do not move them to mac",
    "• Rename electronDownload → electronGet (mirror → mirrorOptions.mirror; isVerifyChecksum:false → unsafelyDisableChecksums:true; drop cache/customDir/customFilename/strictSSL/platform/arch/version/force)",
    "• Rename updateManifest → updateManifestSigning at the root and in mac/win/linux (a 27.0.0-alpha key; the value is unchanged)",
    '• Remove toolsets.* entries set to null (unset resolves to "latest"); replace toolsets.appimage "1.0.2" with "1.0.3" and "1.2.0" with "1.2.1"',
    "• Move root-level package.json directories → build.directories",
    "• Move files / extraResources / extraFiles → fileOptions.files / fileOptions.extraResources / fileOptions.extraFiles, at the root and in mac/mas/masDev/win/linux",
    '• Replace includePdb: true with fileOptions.excludedExts: ["default", "!pdb"] (and add "!pdb" to a mac/mas/masDev/win/linux fileOptions.excludedExts that lists "default"); replace includePdb: false with fileOptions.excludedExts: ["default"]',
    "",
    "• For programmatic configs (JS/TS/MJS/CJS), apply the above changes manually to your config object",
    "• For additional guidance, check the migration walkthrough: https://www.electron.build/docs/migration/v26-to-v27",
    "• Full list of breaking changes: https://www.electron.build/docs/migration/v27-breaking-changes",
  ]
  for (const step of steps) {
    process.stdout.write(`  ${step}\n`)
  }
}
