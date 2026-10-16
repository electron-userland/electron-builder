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
 * Returns `config` with the v26 flat `files` / `extraResources` / `extraFiles` keys moved into `fileOptions`, at the root
 * and on every platform key, so that schema validation and everything after config loading see only `fileOptions`.
 *
 * The root, each platform section and their `fileOptions` are shallow copies, never the caller's objects: those can be
 * the `config` passed to `build()`, and the merge and {@link forwardFlatFileOptionReads} write into what is returned.
 *
 * The flat keys are still accepted in v27; using them logs one warning per process. When a flat key and its `fileOptions`
 * counterpart are both set on the same object, the nested value wins and the flat one is dropped with a warning.
 * A `fileOptions` that is not an object is left alone (flat keys included) for `checkLegacyConfiguration` to report.
 */
export function normalizeFileOptions<T extends Record<string, any>>(config: T): T {
  const moved: string[] = []
  const result = copyHolder(config, "", moved)
  for (const platform of ALL_PLATFORM_KEYS) {
    if (isPlainObject(result[platform])) {
      result[platform] = copyHolder(result[platform], `${platform}.`, moved)
    }
  }

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
  return result as T
}

/** A shallow copy of `holder` (and of its `fileOptions`) with its flat keys moved into `fileOptions`. */
function copyHolder(holder: Record<string, any>, prefix: string, moved: string[]): Record<string, any> {
  // only enumerable properties: the read-forwarding accessors of an already loaded configuration are not copied
  const copy: Record<string, any> = { ...holder }
  const existing = copy.fileOptions
  if (isPlainObject(existing)) {
    copy.fileOptions = { ...existing }
  }

  const present = FILE_OPTION_KEYS.filter(key => hasFlatFileOption(copy, key))
  if (present.length === 0 || (existing != null && !isPlainObject(existing))) {
    return copy
  }

  const fileOptions: Record<string, any> = copy.fileOptions ?? {}
  for (const key of present) {
    const flatPath = `${prefix}${key}`
    if (fileOptions[key] === undefined) {
      fileOptions[key] = copy[key]
      moved.push(flatPath)
    } else {
      log
        .once(`v27-file-options-conflict:${flatPath}`)
        .warn(
          `electron-builder v27: \`${flatPath}\` and \`${nestedPath(flatPath)}\` are both set. \`${nestedPath(flatPath)}\` is used and \`${flatPath}\` is ignored. ` +
            `Remove \`${flatPath}\`, moving any patterns you still need into \`${nestedPath(flatPath)}\`. ${FILE_OPTIONS_URL}`
        )
    }
    delete copy[key]
  }
  copy.fileOptions = fileOptions
  return copy
}

/**
 * Defines `files` / `extraResources` / `extraFiles` on a normalized configuration (root and platform sections, which
 * {@link normalizeFileOptions} made copies of, so a caller's own objects are never decorated) as
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
