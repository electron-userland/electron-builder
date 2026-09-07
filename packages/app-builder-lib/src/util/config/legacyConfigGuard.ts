import { InvalidConfigurationError, log } from "builder-util"
import { Configuration } from "../../configuration.js"
import { BREAKING_CHANGES_URL, formatLegacyOptionMessage, RESOLVED_LEGACY_CONFIG_OPTIONS } from "./legacyOptions.js"

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

const PLATFORMS_WITH_PUBLISH = ["mac", "win", "linux"] as const

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

function docLink(anchor: string): string {
  return `  ${BREAKING_CHANGES_URL}#${anchor}`
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value)
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
    const legacySiblings = RESOLVED_LEGACY_CONFIG_OPTIONS.filter(o => o.parentPath.length === 1 && o.parentPath[0] === platform && o.key in platformConfig).map(o => o.key)
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
 * check has to discriminate on `provider` rather than on the key name.
 */
function checkPublishEntries(config: Record<string, any>, errors: string[]): void {
  const check = (value: unknown, label: string) => {
    if (value == null) {
      return
    }
    for (const entry of Array.isArray(value) ? value : [value]) {
      if (!isPlainObject(entry) || entry.provider !== "github" || !("vPrefixedTagName" in entry)) {
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
  for (const platform of PLATFORMS_WITH_PUBLISH) {
    check(config[platform]?.publish, `${platform}.publish`)
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
