import { InvalidConfigurationError, log } from "builder-util"
import { ALL_PLATFORM_KEYS, BREAKING_CHANGES_URL, FILE_OPTION_KEYS, FILE_OPTIONS_ANCHOR } from "./legacyOptions.js"

const FILE_OPTIONS_URL = `${BREAKING_CHANGES_URL}#${FILE_OPTIONS_ANCHOR}`

export function isPlainObject(value: unknown): value is Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

/**
 * Whether `holder` sets the v26 flat `key` itself. Only an own data property counts: the read-forwarding accessors that
 * {@link forwardFlatFileOptionReads} installs must not be mistaken for a flat key (nor be read, which would warn).
 */
export function hasFlatFileOption(holder: Record<string, any>, key: string): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(holder, key)
  return descriptor != null && "value" in descriptor && descriptor.value !== undefined
}

/** Calls `fn` for the configuration root and each platform section that is an object. */
function forEachFileOptionsHolder(config: Record<string, any>, fn: (holder: Record<string, any>, prefix: string) => void): void {
  fn(config, "")
  for (const platform of ALL_PLATFORM_KEYS) {
    if (isPlainObject(config[platform])) {
      fn(config[platform], `${platform}.`)
    }
  }
}

/** `mac.files` → `mac.fileOptions.files` */
function nestedPath(flatPath: string): string {
  const dot = flatPath.lastIndexOf(".")
  return dot === -1 ? `fileOptions.${flatPath}` : `${flatPath.substring(0, dot)}.fileOptions.${flatPath.substring(dot + 1)}`
}

/**
 * Moves the v26 flat `files` / `extraResources` / `extraFiles` keys of one configuration object into `fileOptions`,
 * at the root and on every platform key, so that schema validation and everything after config loading see only `fileOptions`.
 *
 * The flat keys are still accepted in v27; using them logs one warning per process. When a flat key and its `fileOptions`
 * counterpart are both set on the same object, the nested value wins and the flat one is dropped with a warning.
 * A `fileOptions` that is not an object is left alone (flat keys included) for `checkLegacyConfiguration` to report.
 *
 * Mutates `config`. Idempotent: a normalized configuration has no flat keys left.
 */
export function normalizeFileOptions(config: Record<string, any>): void {
  const moved: string[] = []
  forEachFileOptionsHolder(config, (holder, prefix) => moveFlatFileOptions(holder, prefix, moved))

  if (moved.length > 0) {
    log
      .once("v27-flat-file-options")
      .warn(
        `electron-builder v27 nests \`files\`, \`extraResources\` and \`extraFiles\` under \`fileOptions\`; your configuration still sets [${moved.join(", ")}]. ` +
          `Move them to ${moved.map(it => `\`${nestedPath(it)}\``).join(", ")}. ` +
          "The flat keys are still accepted in v27, with this warning. " +
          `Run \`electron-builder migrate-schema\` to update your configuration automatically. ${FILE_OPTIONS_URL}`
      )
  }
}

function moveFlatFileOptions(holder: Record<string, any>, prefix: string, moved: string[]): void {
  const present = FILE_OPTION_KEYS.filter(key => hasFlatFileOption(holder, key))
  if (present.length === 0) {
    return
  }

  const existing = holder.fileOptions
  if (existing != null && !isPlainObject(existing)) {
    return
  }

  // A new object: `existing` may be shared with another configuration (a preset, a parent config).
  const fileOptions: Record<string, any> = { ...existing }
  for (const key of present) {
    const flatPath = `${prefix}${key}`
    if (fileOptions[key] === undefined) {
      fileOptions[key] = holder[key]
      moved.push(flatPath)
    } else {
      log
        .once(`v27-file-options-conflict:${flatPath}`)
        .warn(
          `electron-builder v27: \`${flatPath}\` and \`${nestedPath(flatPath)}\` are both set. \`${nestedPath(flatPath)}\` is used and \`${flatPath}\` is ignored. ` +
            `Remove \`${flatPath}\`, moving any patterns you still need into \`${nestedPath(flatPath)}\`. ${FILE_OPTIONS_URL}`
        )
    }
    delete holder[key]
  }
  holder.fileOptions = fileOptions
}

/**
 * Defines `files` / `extraResources` / `extraFiles` on a normalized configuration (root and platform sections) as
 * non-enumerable accessors, so that code written against v26 (a hook reading `context.packager.config.files`, a
 * `build()` caller reading `buildResult.configuration.extraResources`) keeps getting the value, with a once-per-key warning.
 *
 * Non-enumerable, so JSON serialization (the effective config), `deepAssign`, spreads and schema validation never see them.
 * Writes throw: a value assigned once file matchers are computed would be silently ignored for the platforms
 * already packed, so the caller is pointed at `fileOptions` instead.
 */
export function forwardFlatFileOptionReads(config: Record<string, any>): void {
  forEachFileOptionsHolder(config, (holder, prefix) => {
    for (const key of FILE_OPTION_KEYS) {
      if (Object.prototype.hasOwnProperty.call(holder, key)) {
        continue
      }
      const flatPath = `config.${prefix}${key}`
      const nested = `config.${nestedPath(prefix + key)}`
      Object.defineProperty(holder, key, {
        enumerable: false,
        configurable: true,
        get() {
          log
            .once(`v27-flat-file-options-read:${flatPath}`)
            .warn(
              `electron-builder v27: \`${flatPath}\` is now \`${nested}\`. Reading \`${flatPath}\` still returns that value in v27, with this warning; read \`${nested}\` instead. ${FILE_OPTIONS_URL}`
            )
          const fileOptions = holder.fileOptions
          return isPlainObject(fileOptions) ? fileOptions[key] : undefined
        },
        set() {
          throw new InvalidConfigurationError(
            `electron-builder v27: \`${flatPath}\` cannot be assigned, it is now \`${nested}\`. Set \`${nested}\` instead, before the files are copied (e.g. in a \`beforePack\` hook). ${FILE_OPTIONS_URL}`
          )
        },
      })
    }
  })
}
