import { InvalidConfigurationError, log } from "builder-util"
import { Configuration } from "../../configuration.js"
import { hasFlatFileOption, isPlainObject } from "./fileOptions.js"
import {
  ALL_PLATFORM_KEYS,
  BREAKING_CHANGES_URL,
  CONFIG_CHANGES_URL,
  FILE_OPTION_KEYS,
  FILE_OPTIONS_ANCHOR,
  formatLegacyOptionMessage,
  MAC_SIGN_FIELDS,
  MAC_SIGN_REMOVED_FIELDS,
  PUBLISH_MANAGED_OPTIONS,
  PUBLISH_MANAGED_OPTIONS_ANCHOR,
  RESOLVED_LEGACY_CONFIG_OPTIONS,
} from "./legacyOptions.js"

/**
 * Build-time guard for configurations still written against v26.
 *
 * Almost every removed key is already rejected by `scheme.json` (`additionalProperties: false`), but
 * ajv can only say "has an unknown property 'identity'" — it cannot say the option moved to
 * `mac.sign.identity`. This pass runs *before* schema validation so the targeted message wins, and it
 * aggregates every legacy key into a single error: a config with a dozen moved mac options should
 * not take a dozen build attempts to fix.
 *
 * Nothing here rejects a value a valid v27 config can contain — every guarded path is covered by a
 * test asserting the v27 schema rejects it too.
 */

/** The v26 signing options of `mac` / `mas` / `masDev`, reported next to a custom signer. */
const MAC_SIGN_SIBLING_KEYS: ReadonlySet<string> = new Set<string>([...MAC_SIGN_FIELDS, ...MAC_SIGN_REMOVED_FIELDS, "signIgnore"])

/** v26 `snap` options that belong under the base-named sub-key in v27, not directly on `snapcraft`. */
const SNAPCRAFT_BASE_LEVEL_KEYS = new Set([
  "confinement",
  "grade",
  "stagePackages",
  "buildPackages",
  "plugs",
  "slots",
  "after",
  "environment",
  "hooks",
  "layout",
  "appPartStage",
  "assumes",
  "autoStart",
  "summary",
  "title",
  "compression",
  "allowNativeWayland",
  "useTemplateApp",
])

const SNAPCRAFT_BASES = ["core18", "core20", "core22", "core24", "custom"]

/** The `<section>.publish` paths that are removed themselves (`mas.publish`, `masDev.publish`): their entries are not checked one by one. */
const REMOVED_PUBLISH_PATHS: ReadonlySet<string> = new Set(RESOLVED_LEGACY_CONFIG_OPTIONS.filter(o => o.key === "publish").map(o => o.fullPath))

/** What a managed publish option did, and what replaces it. */
const PUBLISH_MANAGED_OPTION_DETAILS: Record<keyof typeof PUBLISH_MANAGED_OPTIONS, (value: unknown) => string> = {
  updaterCacheDirName: () => "It never had an effect: electron-builder always writes `<sanitized package name>-updater`.",
  verifyUpdateCodeSignature: () => "It never had an effect (the build rejected it). To opt out of update signature verification, set `win.verifyUpdateCodeSignature: false`.",
  updateManifestPublicKey: () => "It never had an effect (the build rejected it). To pin the update-manifest trust list, set `updateManifest.publicKey`.",
  publisherName: value =>
    `It no longer overrides the Windows publisher name: set \`win.sign.publisherName: ${JSON.stringify(value)}\` (adding \`type: "signtool"\` when \`win.sign\` is unset), ` +
    "or `win.verifyUpdateCodeSignature: false` only if your updates are not Authenticode-signed. In a macOS or Linux section it never had an effect: remove it.",
}

function docLink(anchor: string): string {
  return `  ${CONFIG_CHANGES_URL}#${anchor}`
}

/** Resolves `path` against `config`, returning the holding object or null when any segment is missing. */
function resolveParent(config: Record<string, any>, path: readonly string[]): Record<string, any> | null {
  let node: Record<string, any> = config
  for (const segment of path) {
    const next = node[segment]
    if (!isPlainObject(next)) {
      return null
    }
    node = next
  }
  return node
}

/** Collects the legacy keys present anywhere in the config, using the shared mapping table. */
function collectLegacyKeys(config: Record<string, any>, errors: string[], warnings: string[]): void {
  for (const option of RESOLVED_LEGACY_CONFIG_OPTIONS) {
    const parent = resolveParent(config, option.parentPath)
    if (parent == null || !(option.key in parent)) {
      continue
    }
    const message = formatLegacyOptionMessage(option)
    if (option.severity === "error") {
      errors.push(message)
    } else {
      warnings.push(message)
    }
  }
}

/**
 * `mac.sign` is a single union in v27, so a custom signer and an options bag can no longer coexist.
 * The sibling fields are already reported by `collectLegacyKeys`; this adds the union explanation so
 * the user knows the two forms are mutually exclusive rather than assuming a mechanical move works.
 */
function checkMacCustomSigner(config: Record<string, any>, errors: string[]): void {
  for (const platform of ["mac", "mas", "masDev"] as const) {
    const platformConfig = config[platform]
    if (!isPlainObject(platformConfig)) {
      continue
    }
    const sign = platformConfig.sign
    if (typeof sign !== "string" && typeof sign !== "function") {
      continue
    }
    // only the signing options: other legacy keys of the platform (universal fields, mas removals, ...) are not signer siblings
    const legacySiblings = RESOLVED_LEGACY_CONFIG_OPTIONS.filter(
      o => o.parentPath.length === 1 && o.parentPath[0] === platform && MAC_SIGN_SIBLING_KEYS.has(o.key) && o.key in platformConfig
    ).map(o => o.key)
    if (legacySiblings.length === 0) {
      continue
    }
    errors.push(
      `\`${platform}.sign\` is a custom signing function or module path, and \`${platform}\` also sets [${legacySiblings.join(", ")}].\n` +
        `  In v27 \`${platform}.sign\` is a single union — a custom signer cannot carry signing options alongside it.\n` +
        `  Either keep the custom signer and read those options inside it, or drop it and use an ElectronSignOptions object.\n` +
        docLink("macos-signing-macsign")
    )
  }
}

/**
 * `win.sign` is a discriminated union in v27. Without `type`, ajv reports one
 * "unknown property" error per union branch and never mentions the missing discriminator.
 */
function checkWinSignDiscriminator(config: Record<string, any>, errors: string[]): void {
  const sign = config.win?.sign
  if (!isPlainObject(sign) || "type" in sign) {
    return
  }
  errors.push(
    "`win.sign` is missing its `type` discriminator.\n" +
      '  v27 types `win.sign` as a union: `type: "signtool" | "hsm" | "pkcs11" | "azure"`.\n' +
      '  A config migrated from `win.signtoolOptions` needs `type: "signtool"`; one from `win.azureSignOptions` needs `type: "azure"`.\n' +
      docLink("windows-signing-winsign")
  )
}

/**
 * `snapcraft.base` is required, but because `snapcraft` is `anyOf[SnapcraftOptions, null]` the ajv
 * output collapses to "configuration.snapcraft should be one of these: null" — which reads as an
 * instruction to null out the config.
 */
function checkSnapcraftShape(config: Record<string, any>, errors: string[]): void {
  const snapcraft = config.snapcraft
  if (!isPlainObject(snapcraft)) {
    return
  }
  if (!("base" in snapcraft)) {
    errors.push(
      "`snapcraft` is missing the required `base` field.\n" +
        `  Set it to one of ${SNAPCRAFT_BASES.map(b => `"${b}"`).join(" | ")} and nest that base's options under a matching sub-key, ` +
        'e.g. `{ "snapcraft": { "base": "core22", "core22": { … } } }`.\n' +
        docLink("snap-snapcraft")
    )
    return
  }
  const flatKeys = Object.keys(snapcraft).filter(k => SNAPCRAFT_BASE_LEVEL_KEYS.has(k))
  if (flatKeys.length > 0) {
    errors.push(
      `\`snapcraft\` sets [${flatKeys.join(", ")}] directly, but in v27 those belong under the base-named sub-key.\n` +
        `  Move them under \`snapcraft.${snapcraft.base}\`, e.g. \`{ "snapcraft": { "base": "${snapcraft.base}", "${snapcraft.base}": { "${flatKeys[0]}": … } } }\`.\n` +
        docLink("snap-snapcraft")
    )
  }
}

/**
 * `vPrefixedTagName` was removed from GitHub publish options only — GitLab still supports it, so the
 * check has to discriminate on `provider` rather than on the key name. The fields electron-builder writes into app-update.yml itself
 * are rejected on every provider but `custom`, whose options are not validated (the app-update.yml writer rejects them there).
 */
function checkPublishEntries(config: Record<string, any>, errors: string[]): void {
  const check = (value: unknown, label: string) => {
    if (value == null) {
      return
    }
    for (const entry of Array.isArray(value) ? value : [value]) {
      if (!isPlainObject(entry)) {
        continue
      }
      for (const key of Object.keys(PUBLISH_MANAGED_OPTIONS) as Array<keyof typeof PUBLISH_MANAGED_OPTIONS>) {
        if (entry.provider === "custom" || !(key in entry)) {
          continue
        }
        errors.push(
          `\`${label}.${key}\` was removed from the publish options in electron-builder v27: electron-builder writes it into app-update.yml itself.\n` +
            `  ${PUBLISH_MANAGED_OPTION_DETAILS[key](entry[key])}\n` +
            (key === "publisherName" ? "" : "  Run `electron-builder migrate-schema` to update your configuration automatically.\n") +
            docLink(PUBLISH_MANAGED_OPTIONS_ANCHOR)
        )
      }
      if (entry.provider !== "github" || !("vPrefixedTagName" in entry)) {
        continue
      }
      const suggested = entry.vPrefixedTagName === false ? '""' : '"v"'
      errors.push(
        `\`${label}.vPrefixedTagName\` was removed from the GitHub publish options in v27.\n` +
          `  Use \`tagNamePrefix: ${suggested}\` instead (it defaults to "v", so you can drop the key entirely to keep the default).\n` +
          "  This applies to GitHub only — GitLab's `vPrefixedTagName` is unchanged.\n" +
          "  Run `electron-builder migrate-schema` to update your configuration automatically.\n" +
          docLink("githuboptions-gitlaboptions-vprefixedtagname")
      )
    }
  }
  check(config.publish, "publish")
  // every section that can hold a publish (mac, win, nsis, dmg, appImage, snapcraft, ...), as migrate-schema rewrites them. Not the root
  // publish value itself (a custom provider may have an option named publish), the free-form extraMetadata (package.json fields), or a
  // section whose publish is itself removed (mas, masDev), which collectLegacyKeys reports.
  for (const [key, section] of Object.entries(config)) {
    if (key !== "publish" && key !== "extraMetadata" && isPlainObject(section) && !REMOVED_PUBLISH_PATHS.has(`${key}.publish`)) {
      check(section.publish, `${key}.publish`)
    }
  }
}

/**
 * `fileOptions` is an object holding the `files` / `extraResources` / `extraFiles` lists. Writing the `files` list itself
 * there (`"fileOptions": ["dist/**"]`) is an easy mistake when moving a `files` key into it by hand, and ajv only reports
 * that `fileOptions` "should be object". `normalizeFileOptions` leaves the flat keys next to such a value in place, so
 * they are named here too.
 */
function checkFileOptionsShape(config: Record<string, any>, errors: string[]): void {
  const check = (holder: Record<string, any>, prefix: string) => {
    const value = holder.fileOptions
    if (value == null || isPlainObject(value)) {
      return
    }
    const flatKeys = FILE_OPTION_KEYS.filter(key => hasFlatFileOption(holder, key)).map(key => `${prefix}${key}`)
    const files = Array.isArray(value) || typeof value === "string" ? JSON.stringify(value) : '["**/*"]'
    errors.push(
      `\`${prefix}fileOptions\` must be an object holding \`files\`, \`extraResources\` and/or \`extraFiles\`, not ${Array.isArray(value) ? "an array" : `a ${typeof value}`}` +
        (flatKeys.length > 0 ? ` (the configuration also sets [${flatKeys.join(", ")}], which belong inside it)` : "") +
        ".\n" +
        `  e.g. \`${prefix}fileOptions: { files: ${files} }\`.\n` +
        "  Run `electron-builder migrate-schema` (with `--config <path>` if your config file has another name) to move flat `files` / `extraResources` / `extraFiles` keys into it automatically.\n" +
        docLink(FILE_OPTIONS_ANCHOR)
    )
  }
  check(config, "")
  for (const platform of ALL_PLATFORM_KEYS) {
    if (isPlainObject(config[platform])) {
      check(config[platform], `${platform}.`)
    }
  }
}

/**
 * Throws a single aggregated {@link InvalidConfigurationError} naming every v26 option found, and
 * warns about the ones that are merely discouraged. Runs before schema validation.
 */
export function checkLegacyConfiguration(config: Configuration): void {
  const raw = config as unknown as Record<string, any>
  const errors: string[] = []
  const warnings: string[] = []

  collectLegacyKeys(raw, errors, warnings)
  checkMacCustomSigner(raw, errors)
  checkWinSignDiscriminator(raw, errors)
  checkSnapcraftShape(raw, errors)
  checkPublishEntries(raw, errors)
  checkFileOptionsShape(raw, errors)

  for (const warning of warnings) {
    log.warn(warning)
  }

  if (errors.length === 0) {
    return
  }

  const header =
    errors.length === 1
      ? "Your configuration uses an option that was removed in electron-builder v27:"
      : `Your configuration uses ${errors.length} options that were removed in electron-builder v27:`
  const message = [header, "", ...errors.map(e => `• ${e}`), "", `Full list of breaking changes: ${BREAKING_CHANGES_URL}`].join("\n")
  log.error(null, "invalid configuration")
  throw new InvalidConfigurationError(message)
}
