import { InvalidConfigurationError, log } from "builder-util"
import { DEFAULT_KEYWORD, resolveDefaultKeywordList } from "builder-util/internal"
import { Nullish } from "builder-util-runtime"
import { ALL_PLATFORM_KEYS, CONFIG_CHANGES_URL, FILE_OPTION_KEYS, FILE_OPTIONS_ANCHOR } from "./legacyOptions.js"

const FILE_OPTIONS_URL = `${CONFIG_CHANGES_URL}#${FILE_OPTIONS_ANCHOR}`

export function isPlainObject(value: unknown): value is Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

/**
 * Whether `holder` sets the flat `key` itself. Only an own data property counts: the read-forwarding accessors that
 * {@link forwardFlatFileOptionReads} installs must not be mistaken for a flat key (nor be read, which would warn).
 */
export function hasFlatFileOption(holder: Record<string, any>, key: string): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(holder, key)
  return descriptor != null && "value" in descriptor && descriptor.value !== undefined
}

// An extension is spliced into a `!**/*.{…}` glob, so it may only hold characters that are literal there.
const EXTENSION_PATTERN = /^[\w-]+(\.[\w-]+)*$/

/**
 * Validates a `fileOptions.excludedExts` value and returns its entries as `"default"`, `"ext"` or `"!ext"`, without the leading dot. A list
 * of removals only (e.g. `["!pdb"]`) is rejected: a list without "default" replaces the default extensions, so it would remove from nothing
 * and exclude no extension at all. `optionPath` names the option in the errors (e.g. `mac.fileOptions.excludedExts`).
 */
export function normalizeExcludedExtensions(value: Array<string> | string, optionPath = "fileOptions.excludedExts"): Array<string> {
  const entries = (Array.isArray(value) ? value : [value]).map(entry => normalizeExcludedExtension(entry, optionPath))
  if (entries.length > 0 && entries.every(it => it.startsWith("!"))) {
    // a platform list replaces the root one (a mas list also mac's, a masDev list mac's and mas's), so it cannot remove from those either
    const section = optionPath.substring(0, optionPath.indexOf("."))
    const replaced = section === "masDev" ? "the root list, `mac`'s and `mas`'s" : section === "mas" ? "the root list and `mac`'s" : "the root list"
    const replaces = section === "fileOptions" ? "" : ` (it replaces ${replaced} rather than removing from ${section === "mas" || section === "masDev" ? "them" : "it"})`
    throw new InvalidConfigurationError(
      `\`${optionPath}\` ${JSON.stringify(value)} only removes extensions, so it would exclude no extension at all: a list without "default" replaces ` +
        `the default extensions${replaces}. List "default" too to exclude the default extensions except those, e.g. ${JSON.stringify([DEFAULT_KEYWORD, ...entries])}.`
    )
  }
  return entries
}

/** Warns, once per list and extension, about the `"!ext"` entries of a normalized list (`optionPath`) that remove nothing. */
function warnUnusedRemovals(entries: ReadonlyArray<string>, defaultExtensions: ReadonlyArray<string>, optionPath: string): void {
  const listsDefault = entries.includes(DEFAULT_KEYWORD)
  const listed = [...(listsDefault ? defaultExtensions : []), ...entries.filter(it => it !== DEFAULT_KEYWORD && !it.startsWith("!"))]
  const sameIgnoringCase = (candidates: ReadonlyArray<string>, extension: string) => candidates.find(it => it !== extension && it.toLowerCase() === extension.toLowerCase())
  for (const extension of resolveDefaultKeywordList(entries, defaultExtensions).unusedRemovals) {
    const listedCase = sameIgnoringCase(listed, extension)
    const defaultCase = listsDefault ? undefined : sameIgnoringCase(defaultExtensions, extension)
    const advice =
      listedCase != null
        ? `Extensions are case-sensitive: did you mean "!${listedCase}"?`
        : !listsDefault && defaultExtensions.includes(extension)
          ? `List "default" too to exclude the default extensions except "${extension}".`
          : defaultCase != null
            ? `Extensions are case-sensitive, and the list does not have "default": list "default" and "!${defaultCase}" to exclude the default extensions except "${defaultCase}".`
            : "Remove the entry."
    log.once(`excluded-exts-removal:${optionPath}:${extension}`).warn(`"!${extension}" in \`${optionPath}\` has no effect: "${extension}" is not otherwise excluded. ${advice}`)
  }
}

function normalizeExcludedExtension(entry: string, optionPath: string): string {
  const isRemoval = entry.startsWith("!")
  const extension = (isRemoval ? entry.substring(1) : entry).replace(/^\./, "")
  if (extension === DEFAULT_KEYWORD) {
    if (isRemoval) {
      throw new InvalidConfigurationError(`"${entry}" in \`${optionPath}\` is not supported: leave "default" out of the list to not exclude the default extensions.`)
    }
  } else if (!EXTENSION_PATTERN.test(extension)) {
    throw new InvalidConfigurationError(
      `"${entry}" in \`${optionPath}\` is not a file extension: write the extension without a dot or glob, e.g. "pdb", or "!pdb" to remove it from the excluded ones.`
    )
  }
  return isRemoval ? `!${extension}` : extension
}

/**
 * Validates `fileOptions.excludedExts` at the configuration root and in each platform section, so an invalid list fails the build up front
 * rather than only when a target of that platform (e.g. `mas-dev`) is packed, and warns about its `"!ext"` entries that remove nothing, naming
 * the section. `defaultExtensions` is the list `"default"` stands for. Runs after schema validation.
 */
export function validateExcludedExtensionsOptions(config: Record<string, any>, defaultExtensions: ReadonlyArray<string>): void {
  forEachFileOptionsHolder(config, (holder, prefix) => {
    const value = isPlainObject(holder.fileOptions) ? holder.fileOptions.excludedExts : null
    if (value != null) {
      const optionPath = `${prefix}fileOptions.excludedExts`
      warnUnusedRemovals(normalizeExcludedExtensions(value, optionPath), defaultExtensions, optionPath)
    }
  })
}

/**
 * Sets the `fileOptions.excludedExts` of `merged` (the `deepAssign` of `sources`) to the last non-null value among `sources`. `deepAssign`
 * merges two arrays, but a later configuration's (`extends`) or platform section's (`mac` → `mas` → `masDev`) list replaces an earlier one,
 * so that it can drop an earlier `"!ext"` (see `FilesBuildOptions.excludedExts`). The `fileOptions` of `merged` is replaced by a copy, since
 * `deepAssign` may have left it shared with one of `sources`.
 */
export function replaceMergedExcludedExts(merged: Record<string, any> | Nullish, sources: ReadonlyArray<Record<string, any> | Nullish>): void {
  if (merged == null || !isPlainObject(merged.fileOptions)) {
    return
  }
  for (let i = sources.length - 1; i >= 0; i--) {
    const fileOptions = sources[i]?.fileOptions
    if (isPlainObject(fileOptions) && fileOptions.excludedExts != null) {
      merged.fileOptions = { ...merged.fileOptions, excludedExts: fileOptions.excludedExts }
      return
    }
  }
}

/** {@link replaceMergedExcludedExts} for the configuration root and each platform section of `merged`, the `deepAssign` of `configs`. */
export function replaceMergedConfigExcludedExts(merged: Record<string, any>, configs: ReadonlyArray<Record<string, any> | Nullish>): void {
  forEachFileOptionsHolder(merged, (holder, prefix) => {
    const platform = prefix.substring(0, prefix.length - 1)
    replaceMergedExcludedExts(
      holder,
      configs.map(it => (platform.length === 0 ? it : it?.[platform]))
    )
  })
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
 * Returns `config` with flat `files` / `extraResources` / `extraFiles` keys moved into `fileOptions`, at the root
 * and on every platform key, so that schema validation and everything after config loading see only `fileOptions`.
 *
 * The root, each platform section and their `fileOptions` are shallow copies, never the caller's objects: those can be
 * the `config` passed to `build()`, and the merge and {@link forwardFlatFileOptionReads} write into what is returned.
 *
 * Flat keys are applied as their `fileOptions` counterparts and log one warning per process. When a flat key and its `fileOptions`
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
      .once("flat-file-options")
      .warn(
        `\`files\`, \`extraResources\` and \`extraFiles\` belong under \`fileOptions\`. Found [${moved.join(", ")}] outside it; ` +
          `they are applied as ${moved.map(it => `\`${nestedPath(it)}\``).join(", ")}. ` +
          `Run \`electron-builder migrate-schema\` to update the configuration. ${FILE_OPTIONS_URL}`
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
        .once(`file-options-conflict:${flatPath}`)
        .warn(
          `\`${flatPath}\` and \`${nestedPath(flatPath)}\` are both set. \`${nestedPath(flatPath)}\` is used and \`${flatPath}\` is ignored. ` +
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
 * non-enumerable accessors, so that code reading a flat key (a hook reading `context.packager.config.files`, a
 * `build()` caller reading `buildResult.configuration.extraResources`) gets the `fileOptions` value, with a once-per-key warning.
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
          log.once(`flat-file-options-read:${flatPath}`).warn(`\`${flatPath}\` is not a configuration property; read \`${nested}\`. ${FILE_OPTIONS_URL}`)
          const fileOptions = holder.fileOptions
          return isPlainObject(fileOptions) ? fileOptions[key] : undefined
        },
        set() {
          throw new InvalidConfigurationError(
            `\`${flatPath}\` is not a configuration property and cannot be assigned; set \`${nested}\` instead, before the files are copied (e.g. in a \`beforePack\` hook). ${FILE_OPTIONS_URL}`
          )
        },
      })
    }
  })
}
