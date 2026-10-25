import {
  asArray,
  copyDir,
  copyOrLinkFile,
  ExternalLinkPolicy,
  FileTransformer,
  Filter,
  InvalidConfigurationError,
  isPathWithin,
  log,
  statOrNull,
  USE_HARD_LINKS,
  WriteContainment,
} from "builder-util"
import { DEFAULT_KEYWORD, resolveDefaultKeywordList } from "builder-util/internal"
import { Nullish } from "builder-util-runtime"
import { Minimatch } from "minimatch"
import * as path from "path"
import type { Configuration } from "./configuration.js"
import type { Packager } from "./packager.js"
import { FileSet, PlatformSpecificBuildOptions } from "./options/PlatformSpecificBuildOptions.js"
import { normalizeExcludedExtensions } from "./util/config/fileOptions.js"
import { PlatformPackager } from "./platformPackager.js"
import { createFilter, hasMagic } from "./util/filter.js"
import { BUILD_CHANGES_URL } from "./util/config/legacyOptions.js"

// https://github.com/electron-userland/electron-builder/issues/733
const minimatchOptions = { dot: true }

// noinspection SpellCheckingInspection
// File/dir names excluded by default from the packaged app. A `files` entry may opt any of these
// back in (see collectExplicitReincludes / getDefaultIgnoredPatterns).
export const DEFAULT_EXCLUDED_NAMES: ReadonlyArray<string> = [
  ".git",
  ".hg",
  ".svn",
  "CVS",
  "RCS",
  "SCCS",
  "__pycache__",
  ".DS_Store",
  "thumbs.db",
  ".gitignore",
  ".gitkeep",
  ".gitattributes",
  ".npmignore",
  ".idea",
  ".vs",
  ".flowconfig",
  ".jshintrc",
  ".eslintrc",
  ".circleci",
  ".yarn-integrity",
  ".yarn-metadata.json",
  "yarn-error.log",
  "yarn.lock",
  "package-lock.json",
  "npm-debug.log",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "appveyor.yml",
  ".travis.yml",
  "circle.yml",
  ".nyc_output",
  ".husky",
  ".github",
  "electron-builder.env",
]

// File extensions (without leading dot) excluded by default from the packaged app, the `"default"` entry of `fileOptions.excludedExts`.
export const DEFAULT_EXCLUDED_EXTENSIONS: ReadonlyArray<string> = [
  "iml",
  "hprof",
  "orig",
  "pyc",
  "pyo",
  "rbc",
  "swp",
  "csproj",
  "sln",
  "slnx",
  "suo",
  "xproj",
  "cc",
  "d.ts",
  // https://github.com/electron-userland/electron-builder/issues/7512
  "mk",
  "a",
  "o",
  "obj",
  "forge-meta",
  "pdb",
]

/**
 * The file extensions (without leading dot) excluded from the app files and the copied `node_modules`, from the
 * `fileOptions.excludedExts` build option: the platform-level value (`mac.fileOptions.excludedExts`, ...) when it is set,
 * otherwise the root one, otherwise `["default"]`. See `FilesBuildOptions.excludedExts`.
 */
export function resolveExcludedExtensions(config: Pick<Configuration, "fileOptions">, platformOptions: PlatformSpecificBuildOptions | Nullish): Array<string> {
  const entries = platformOptions?.fileOptions?.excludedExts ?? config.fileOptions?.excludedExts ?? [DEFAULT_KEYWORD]
  // a "!ext" that removes nothing is reported by validateConfiguration, naming the section
  return resolveDefaultKeywordList(normalizeExcludedExtensions(entries), DEFAULT_EXCLUDED_EXTENSIONS).result
}

// Hard cap on the number of strings a single pattern may expand to. Real opt-in patterns expand to a
// handful (`{obj,gltf,glb}`); this bound makes the expansion provably finite so a pathological pattern
// (e.g. nested or many large `{...}` groups whose product is huge) degrades to "treated literally"
// rather than hanging/OOM-ing the build. minimatch performs the authoritative expansion downstream.
const MAX_BRACE_EXPANSIONS = 64

// Expands `{a,b,c}` brace alternations in a pattern, honoring nesting. Returns the value unchanged
// when it has no braces or would expand beyond MAX_BRACE_EXPANSIONS. Used only to detect which
// extensions/names a `files` entry references — not for matching.
function expandBraces(value: string): Array<string> {
  const open = value.indexOf("{")
  if (open === -1) {
    return [value]
  }
  // Find the `}` that closes the first `{`, accounting for nested braces.
  let depth = 0
  let close = -1
  for (let i = open; i < value.length; i++) {
    if (value[i] === "{") {
      depth++
    } else if (value[i] === "}" && --depth === 0) {
      close = i
      break
    }
  }
  if (close === -1) {
    return [value]
  }

  const prefix = value.slice(0, open)
  const suffix = value.slice(close + 1)
  const result: Array<string> = []
  for (const alternative of splitTopLevel(value.slice(open + 1, close))) {
    for (const expanded of expandBraces(`${prefix}${alternative}${suffix}`)) {
      if (result.length >= MAX_BRACE_EXPANSIONS) {
        return [value]
      }
      result.push(expanded)
    }
  }
  return result
}

// Splits on commas that are not inside a nested brace group, so `a,{b,c}` yields ["a", "{b,c}"].
function splitTopLevel(value: string): Array<string> {
  const parts: Array<string> = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === "{") {
      depth++
    } else if (ch === "}") {
      depth--
    } else if (ch === "," && depth === 0) {
      parts.push(value.slice(start, i))
      start = i + 1
    }
  }
  parts.push(value.slice(start))
  return parts
}

/**
 * Determines which excluded extensions (`excludedExtensions`, see {@link resolveExcludedExtensions}) and default-excluded
 * names a user has explicitly opted back in to via their `files` patterns: the extensions for the warning (the files a pattern
 * names are let through by {@link FileMatcher.extensionReincludes}), the names to leave out of the name exclusion glob.
 *
 * An exclusion is treated as opted back in only when a non-negated pattern references it concretely:
 * an extension when a pattern's basename ends with `.<ext>` (e.g. `**\/*.obj`, `assets/*.{obj,gltf}`,
 * `**\/*.d.ts`), only the longest such extension counting (`*.d.ts` names `d.ts`, not also a listed `ts`);
 * a name when any path segment equals it (e.g. `**\/.github/**`, `**\/yarn.lock`).
 * Broad patterns such as `**\/*` reference nothing concrete and therefore opt nothing in.
 */
export function collectExplicitReincludes(
  patterns: ReadonlyArray<string>,
  excludedExtensions: ReadonlyArray<string> = DEFAULT_EXCLUDED_EXTENSIONS
): { extensions: Set<string>; names: Set<string> } {
  const segments = new Set<string>()
  const namedExtensions = new Set<string>()
  for (const pattern of patterns) {
    if (pattern.startsWith("!")) {
      continue
    }
    for (const expanded of expandBraces(pattern)) {
      const parts = expanded.split("/")
      for (const part of parts) {
        segments.add(part)
      }
      const named = longestExcludedExtension(parts[parts.length - 1], excludedExtensions)
      if (named != null) {
        namedExtensions.add(named)
      }
    }
  }

  const extensions = new Set(excludedExtensions.filter(ext => namedExtensions.has(ext)))
  const names = new Set(DEFAULT_EXCLUDED_NAMES.filter(name => segments.has(name)))
  return { extensions, names }
}

/**
 * Builds the trailing list of default ignore globs appended to the main app file matcher: a glob that excludes every one of
 * `excludedExtensions` (see {@link resolveExcludedExtensions}), then the default-excluded names except those a `files` entry
 * re-includes (see {@link collectExplicitReincludes}) and the fixed ignores. The files a `files` entry names despite their
 * excluded extension are let through by {@link FileMatcher.extensionReincludes}, not by these patterns.
 */
export function getDefaultIgnoredPatterns(userPatterns: ReadonlyArray<string>, excludedExtensions: ReadonlyArray<string> = DEFAULT_EXCLUDED_EXTENSIONS): Array<string> {
  const reincludedNames = collectExplicitReincludes(userPatterns, excludedExtensions).names
  const names = DEFAULT_EXCLUDED_NAMES.filter(name => !reincludedNames.has(name))

  const patterns: Array<string> = []
  const extensionGlob = excludedExtensionsGlob(excludedExtensions)
  if (extensionGlob != null) {
    patterns.push(extensionGlob)
  }
  patterns.push("!**/._*")
  patterns.push("!**/electron-builder.{yaml,yml,json,json5,toml,ts}")
  // minimatch does not expand a single-member brace (`{x}` is matched literally), so emit a bare
  // glob when only one name is excluded.
  if (names.length === 1) {
    patterns.push(`!**/${names[0]}`)
  } else if (names.length > 1) {
    patterns.push(`!**/{${names.join(",")}}`)
  }
  patterns.push("!.yarn{,/**/*}")
  // https://github.com/electron-userland/electron-builder/issues/1969
  // exclude only for app root, use .yarnclean to clean node_modules
  patterns.push("!.editorconfig")
  patterns.push("!.yarnrc.yml")
  return patterns
}

/** The glob that excludes `excludedExtensions` (a bare one for a single extension, since minimatch matches `{x}` literally), or null for none. */
function excludedExtensionsGlob(excludedExtensions: ReadonlyArray<string>): string | null {
  if (excludedExtensions.length === 0) {
    return null
  }
  return excludedExtensions.length === 1 ? `!**/*.${excludedExtensions[0]}` : `!**/*.{${excludedExtensions.join(",")}}`
}

/** The longest of `excludedExtensions` that `name` ends with (`index.d.ts` → `d.ts`, not also a listed `ts`), or null. */
function longestExcludedExtension(name: string, excludedExtensions: ReadonlyArray<string>): string | null {
  let result: string | null = null
  for (const ext of excludedExtensions) {
    if (name.endsWith(`.${ext}`) && (result == null || ext.length > result.length)) {
      result = ext
    }
  }
  return result
}

/**
 * Per excluded extension, the `files` patterns that name it: each brace-expanded alternative of a non-negated pattern whose basename
 * ends with that extension (the longest one, see {@link longestExcludedExtension}). An alternative of `native/{**\/*,addon.pdb}`
 * without such an extension names nothing. An alternative that still holds braces (a pattern too large to expand, or a literal brace)
 * is recorded whole: an extension cannot hold a brace, so the extension it ends with follows its last brace and every alternative minimatch
 * expands it to ends with it.
 */
function collectExtensionReincludes(patterns: ReadonlyArray<string>, excludedExtensions: ReadonlyArray<string>): Map<string, Array<string>> {
  const result = new Map<string, Array<string>>()
  for (const pattern of patterns) {
    if (pattern.startsWith("!")) {
      continue
    }
    for (const expanded of expandBraces(pattern)) {
      const extension = longestExcludedExtension(expanded.substring(expanded.lastIndexOf("/") + 1), excludedExtensions)
      if (extension != null) {
        result.set(extension, [...(result.get(extension) ?? []), expanded])
      }
    }
  }
  return result
}

/**
 * Lets through the files a `files` pattern names despite their excluded extension (see getMainFileMatchers): the extension glob
 * excludes every file with an excluded extension, and such a file is included only when a pattern that names its extension matches
 * it and the matcher's other patterns (`node_modules` and the build resources and output directories, `files` negations) include it.
 */
export interface ExtensionReincludes {
  /** The pattern of the matcher that excludes the extensions. */
  readonly glob: string
  readonly extensions: ReadonlyArray<string>
  /** Per excluded extension, the `files` patterns that name it (see {@link collectExtensionReincludes}). */
  readonly namedBy: ReadonlyMap<string, ReadonlyArray<string>>
}

/**
 * Returns the default-excluded names/extensions that the given `files` patterns opt back in, formatted
 * for display (extensions as `*.<ext>`, names verbatim). Empty when nothing default-excluded is
 * re-included. Used to warn that files normally kept out of the package will now be included.
 */
export function getReincludedDefaultExclusions(patterns: ReadonlyArray<string>, excludedExtensions: ReadonlyArray<string> = DEFAULT_EXCLUDED_EXTENSIONS): Array<string> {
  const reincluded = collectExplicitReincludes(patterns, excludedExtensions)
  return [...[...reincluded.extensions].map(ext => `*.${ext}`), ...reincluded.names]
}

function ensureNoEndSlash(file: string): string {
  if (path.sep !== "/") {
    file = file.replace(/\//g, path.sep)
  }
  if (path.sep !== "\\") {
    file = file.replace(/\\/g, path.sep)
  }

  if (file.endsWith(path.sep)) {
    return file.substring(0, file.length - 1)
  } else {
    return file
  }
}

export class FileMatcher {
  readonly from: string
  readonly to: string

  readonly patterns: Array<string>

  excludePatterns: Array<Minimatch> | null = null

  /** The files a `files` pattern names despite their excluded extension, which the filter lets through the extension glob. */
  extensionReincludes: ExtensionReincludes | null = null

  readonly isSpecifiedAsEmptyArray: boolean

  constructor(
    from: string,
    to: string,
    readonly macroExpander: (pattern: string) => string,
    patterns?: Array<string> | string | null
  ) {
    this.from = ensureNoEndSlash(macroExpander(from))
    this.to = ensureNoEndSlash(macroExpander(to))
    this.patterns = asArray(patterns).map(it => this.normalizePattern(it))
    this.isSpecifiedAsEmptyArray = Array.isArray(patterns) && patterns.length === 0
  }

  normalizePattern(pattern: string) {
    if (pattern.startsWith("./")) {
      pattern = pattern.substring("./".length)
    }
    return path.posix.normalize(this.macroExpander(pattern.replace(/\\/g, "/")))
  }

  addPattern(pattern: string) {
    this.patterns.push(this.normalizePattern(pattern))
  }

  prependPattern(pattern: string) {
    this.patterns.unshift(this.normalizePattern(pattern))
  }

  isEmpty() {
    return this.patterns.length === 0
  }

  containsOnlyIgnore(): boolean {
    return !this.isEmpty() && this.patterns.find(it => !it.startsWith("!")) == null
  }

  computeParsedPatterns(result: Array<Minimatch>, fromDir?: string, patterns: ReadonlyArray<string> = this.patterns): void {
    const relativeFrom = fromDir == null ? null : path.relative(fromDir, this.from)

    if (patterns.length === 0 && relativeFrom != null) {
      // file mappings, from here is a file
      result.push(new Minimatch(relativeFrom, minimatchOptions))
      return
    }

    for (let pattern of patterns) {
      if (relativeFrom != null) {
        pattern = path.join(relativeFrom, pattern)
      }

      const parsedPattern = new Minimatch(pattern, minimatchOptions)
      result.push(parsedPattern)

      // do not add if contains dot (possibly file if has extension)
      if (!pattern.includes(".") && !hasMagic(parsedPattern)) {
        // https://github.com/electron-userland/electron-builder/issues/545
        // add **/*
        result.push(new Minimatch(`${pattern}/**/*`, minimatchOptions))
      }
    }
  }

  createFilter(): Filter {
    const parsedPatterns: Array<Minimatch> = []
    this.computeParsedPatterns(parsedPatterns)
    const filter = createFilter(this.from, parsedPatterns, this.excludePatterns)
    const reincludes = this.extensionReincludes
    if (reincludes == null) {
      return filter
    }

    // only the glob getMainFileMatchers appended (the last one): a `files` negation with the same text still applies
    const globIndex = this.patterns.lastIndexOf(reincludes.glob)
    const withoutGlob = this.patterns.filter((_, index) => index !== globIndex)
    const otherPatterns: Array<Minimatch> = []
    this.computeParsedPatterns(otherPatterns, undefined, withoutGlob)
    const withoutExtensionGlob = createFilter(this.from, otherPatterns, this.excludePatterns)
    const namedBy = new Map([...reincludes.namedBy].map(([extension, patterns]) => [extension, patterns.map(it => new Minimatch(it, minimatchOptions))]))
    return (file, stat) => {
      if (filter(file, stat)) {
        return true
      }
      // a directory named with an excluded extension stays excluded
      if (stat.isDirectory()) {
        return false
      }
      const extension = longestExcludedExtension(path.basename(file), reincludes.extensions)
      const named = extension == null ? undefined : namedBy.get(extension)
      if (named == null) {
        return false
      }
      const relative = path.relative(this.from, file).split(path.sep).join("/")
      return named.some(it => it.match(relative)) && withoutExtensionGlob(file, stat)
    }
  }

  toString() {
    return `from: ${this.from}, to: ${this.to}, patterns: ${this.patterns.join(", ")}`
  }
}

/** @internal */
export function getMainFileMatchers(
  appDir: string,
  destination: string,
  macroExpander: (pattern: string) => string,
  platformSpecificBuildOptions: PlatformSpecificBuildOptions,
  platformPackager: PlatformPackager<any>,
  outDir: string
): Array<FileMatcher> {
  const buildResourceDir = path.resolve(platformPackager.projectDir, platformPackager.buildResourcesDir)

  let matchers = platformPackager.isPrepackedAppAsar
    ? null
    : getFileMatchers(platformPackager.config, "files", destination, {
        macroExpander,
        customBuildOptions: platformSpecificBuildOptions,
        globalOutDir: outDir,
        defaultSrc: appDir,
      })
  if (matchers == null) {
    matchers = [new FileMatcher(appDir, destination, macroExpander)]
  }

  const matcher = matchers[0]
  // add default patterns, but only if from equals to app dir
  if (matcher.from !== appDir) {
    return matchers
  }

  // https://github.com/electron-userland/electron-builder/issues/1741#issuecomment-311111418 so, do not use inclusive patterns
  const patterns = matcher.patterns

  // Snapshot the user-specified patterns before the default/auto patterns are injected so a `files`
  // entry can opt back in to a default-excluded extension/name (see getDefaultIgnoredPatterns).
  const userSpecifiedPatterns = patterns.slice()

  const customFirstPatterns: Array<string> = []
  // electron-webpack - we need to copy only package.json and node_modules from root dir (and these files are added by default), so, explicit empty array is specified
  if (!matcher.isSpecifiedAsEmptyArray && (matcher.isEmpty() || matcher.containsOnlyIgnore())) {
    customFirstPatterns.push("**/*")
  } else if (!patterns.includes("package.json")) {
    patterns.push("package.json")
  }

  let insertExculdeNodeModulesIndex = -1
  for (let i = 0; i < patterns.length; i++) {
    if (!patterns[i].startsWith("!") && (patterns[i].includes("/node_modules") || patterns[i].includes("node_modules/"))) {
      insertExculdeNodeModulesIndex = i
      break
    }
  }

  if (insertExculdeNodeModulesIndex !== -1) {
    patterns.splice(insertExculdeNodeModulesIndex, 0, ...["!**/node_modules/**"])
  } else {
    customFirstPatterns.push("!**/node_modules/**")
  }

  // https://github.com/electron-userland/electron-builder/issues/1482
  const relativeBuildResourceDir = path.relative(matcher.from, buildResourceDir)
  if (relativeBuildResourceDir.length !== 0 && !relativeBuildResourceDir.startsWith(".")) {
    customFirstPatterns.push(`!${relativeBuildResourceDir}{,/**/*}`)
  }

  const relativeOutDir = matcher.normalizePattern(path.relative(platformPackager.projectDir, outDir))
  if (!relativeOutDir.startsWith(".")) {
    customFirstPatterns.push(`!${relativeOutDir}{,/**/*}`)
  }

  // add our default exclusions after last user possibly defined "all"/permissive pattern
  let insertIndex = 0
  for (let i = patterns.length - 1; i >= 0; i--) {
    if (patterns[i].startsWith("**/")) {
      insertIndex = i + 1
      break
    }
  }
  patterns.splice(insertIndex, 0, ...customFirstPatterns)

  const excludedExtensions = resolveExcludedExtensions(platformPackager.config, platformSpecificBuildOptions)
  const reincludedDefaults = getReincludedDefaultExclusions(userSpecifiedPatterns, excludedExtensions)
  if (reincludedDefaults.length > 0) {
    // These files are kept out of the package by default; a user `files` pattern is opting them back in.
    log.warn({ files: reincludedDefaults.join(", ") }, "`files` configuration re-includes files that are excluded by default — verify this is intentional")
  }

  patterns.push(...getDefaultIgnoredPatterns(userSpecifiedPatterns, excludedExtensions))
  const extensionGlob = excludedExtensionsGlob(excludedExtensions)
  const namedBy = collectExtensionReincludes(userSpecifiedPatterns, excludedExtensions)
  if (extensionGlob != null && namedBy.size > 0) {
    matcher.extensionReincludes = { glob: extensionGlob, extensions: excludedExtensions, namedBy }
  }

  const debugLogger = platformPackager.debugLogger
  if (debugLogger.isEnabled) {
    //tslint:disable-next-line:no-invalid-template-strings
    debugLogger.add(`${macroExpander("${arch}")}.firstOrDefaultFilePatterns`, patterns)
  }
  return matchers
}

/** @internal */
export function getNodeModuleFileMatcher(
  appDir: string,
  destination: string,
  macroExpander: (pattern: string) => string,
  platformSpecificBuildOptions: PlatformSpecificBuildOptions,
  packager: Packager
): FileMatcher {
  // https://github.com/electron-userland/electron-builder/pull/2948#issuecomment-392241632
  // grab only excludes
  const matcher = new FileMatcher(appDir, destination, macroExpander)

  function addPatterns(patterns: Array<string | FileSet> | string | Nullish | FileSet) {
    if (patterns == null) {
      return
    } else if (!Array.isArray(patterns)) {
      if (typeof patterns === "string" && patterns.startsWith("!")) {
        matcher.addPattern(patterns)
        return
      }
      // ignore object form
      return
    }

    for (const pattern of patterns) {
      if (typeof pattern === "string") {
        if (pattern.startsWith("!")) {
          matcher.addPattern(pattern)
        }
      } else {
        const fileSet = pattern
        if (fileSet.from == null || fileSet.from === ".") {
          for (const p of asArray(fileSet.filter)) {
            matcher.addPattern(p)
          }
        }
      }
    }
  }

  addPatterns(packager.config.fileOptions?.files)
  addPatterns(platformSpecificBuildOptions.fileOptions?.files)

  if (!matcher.isEmpty()) {
    matcher.prependPattern("**/*")
  }

  const debugLogger = packager.debugLogger
  if (debugLogger.isEnabled) {
    //tslint:disable-next-line:no-invalid-template-strings
    debugLogger.add(`${macroExpander("${arch}")}.nodeModuleFilePatterns`, matcher.patterns)
  }

  return matcher
}

export interface GetFileMatchersOptions {
  readonly macroExpander: (pattern: string) => string
  readonly customBuildOptions: PlatformSpecificBuildOptions
  readonly globalOutDir: string

  readonly defaultSrc: string
}

// The names whose file sets are physically copied into the build output directory, so a `to` that
// resolves outside of it writes onto the build machine itself (https://github.com/electron-userland/electron-builder/issues/1993).
// `files` is excluded: its `to` is only used for in-package (asar) relative math.
const VALIDATED_DESTINATION_NAMES: ReadonlyArray<string> = ["extraFiles", "extraResources", "extraDistFiles"]

const FPM_MAPPING_HINT =
  'To install a file at an absolute path inside a deb/rpm package, use the fpm file-mapping syntax instead, e.g. "deb": { "fpm": ["build/file.xml=/usr/share/metainfo/file.xml"] }.'
const DESTINATION_DOCS = `See ${BUILD_CHANGES_URL}#extrafiles--extraresources-destinations-are-validated`

/**
 * Resolves a file set `to` to the destination a FileMatcher should copy into.
 *
 * - A missing `to` falls back to `defaultDestination`.
 * - For file sets that are physically copied into the build output directory
 *   (see {@link VALIDATED_DESTINATION_NAMES}), the result is validated to stay inside it:
 *   absolute `to` values (POSIX, Windows drive-letter, or UNC — files would be copied to that
 *   literal path on the build machine) and relative values that escape `globalOutDir`
 *   (e.g. `../../usr/share`) throw. Relative hops that stay inside the build output directory
 *   (e.g. `to: "../Frameworks"` from `Contents/Resources` on macOS) remain valid.
 * - `files` sets are exempt from validation: their `to` only participates in in-package (asar)
 *   relative math, so it is plainly resolved against `defaultDestination`.
 */
export function resolveFileSetDestination(name: string, to: string | Nullish, defaultDestination: string, globalOutDir: string): string {
  if (to == null) {
    return defaultDestination
  }

  if (!VALIDATED_DESTINATION_NAMES.includes(name)) {
    return path.resolve(defaultDestination, to)
  }

  // path.win32.isAbsolute also covers POSIX absolute paths, and treats drive-letter (C:\) and
  // UNC (\\server\share) paths as absolute no matter which OS the build runs on
  if (path.win32.isAbsolute(to) || path.posix.isAbsolute(to)) {
    throw new InvalidConfigurationError(
      `The "to" path "${to}" in "${name}" is absolute. Absolute destinations are not copied into the packaged app — they would be written to that literal path on the build machine. Use a relative path instead. ${FPM_MAPPING_HINT} ${DESTINATION_DOCS}`
    )
  }

  // FileMatcher later converts all separators to path.sep, so normalize before resolving to make
  // sure `..\\..` segments written with backslashes are seen as parent hops here too
  const resolved = path.resolve(defaultDestination, to.replace(/[/\\]/g, path.sep))
  const relativeToOutDir = path.relative(path.resolve(globalOutDir), resolved)
  if (relativeToOutDir.startsWith(`..${path.sep}`) || relativeToOutDir === ".." || path.isAbsolute(relativeToOutDir)) {
    throw new InvalidConfigurationError(
      `The "to" path "${to}" in "${name}" resolves to "${resolved}", which is outside the build output directory "${path.resolve(globalOutDir)}". The files would be copied onto the build machine instead of into the packaged app. Use a relative path that stays within the package. ${FPM_MAPPING_HINT} ${DESTINATION_DOCS}`
    )
  }
  return resolved
}

export function getFileMatchers(
  config: Configuration,
  name: "files" | "extraFiles" | "extraResources" | "extraDistFiles",
  defaultDestination: string,
  options: GetFileMatchersOptions
): Array<FileMatcher> | null {
  const defaultMatcher = new FileMatcher(options.defaultSrc, defaultDestination, options.macroExpander)
  const fileMatchers: Array<FileMatcher> = []

  function addPatterns(patterns: Array<string | FileSet> | string | Nullish | FileSet) {
    if (patterns == null) {
      return
    } else if (!Array.isArray(patterns)) {
      if (typeof patterns === "string") {
        defaultMatcher.addPattern(patterns)
        return
      }
      patterns = [patterns]
    }

    for (const pattern of patterns) {
      if (typeof pattern === "string") {
        // use normalize to transform ./foo to foo
        defaultMatcher.addPattern(pattern)
      } else {
        const from = pattern.from == null ? options.defaultSrc : path.resolve(options.defaultSrc, pattern.from)
        const to = resolveFileSetDestination(name, pattern.to, defaultDestination, options.globalOutDir)
        fileMatchers.push(new FileMatcher(from, to, options.macroExpander, pattern.filter))
      }
    }
  }

  // `extraDistFiles` is a mac option of its own; the others are read from `fileOptions`, into which flat keys are
  // normalized when the configuration is loaded (see util/config/fileOptions.ts)
  if (name === "extraDistFiles") {
    addPatterns((options.customBuildOptions as any).extraDistFiles)
  } else {
    addPatterns(config.fileOptions?.[name])
    addPatterns(options.customBuildOptions.fileOptions?.[name])
  }

  if (!defaultMatcher.isEmpty()) {
    // default matcher should be first in the array
    fileMatchers.unshift(defaultMatcher)
  }

  // we cannot exclude the whole out dir, because sometimes users want to use some file in the out dir in the patterns
  const relativeOutDir = defaultMatcher.normalizePattern(path.relative(options.defaultSrc, options.globalOutDir))
  if (!relativeOutDir.startsWith(".")) {
    defaultMatcher.addPattern(`!${relativeOutDir}/*-unpacked{,/**/*}`)
  }

  return fileMatchers.length === 0 ? null : fileMatchers
}

/** Where {@link copyFiles} may write, and where a copied symlink may lead. */
export interface CopyFilesContainment {
  /**
   * The output directories the matchers copy into, most specific first (e.g. the app output directory, then the output directory).
   * Each matcher is confined, by real path, to the first one its destination is in.
   */
  readonly roots: ReadonlyArray<string>
  /** Besides the root, the directories a copied symlink may lead into, such as the workspace root and the package-manager store. */
  readonly allowedSymlinkRoots?: ReadonlyArray<string> | null
  /** The `fileOptions.allowExternalLinks` build option: a copied symlink that leads anywhere else is kept when it allows it. */
  readonly externalLinks?: ExternalLinkPolicy | null
}

function containmentRootFor(destination: string, containment: CopyFilesContainment | Nullish): string {
  return containment?.roots.find(root => isPathWithin(path.resolve(root), path.resolve(destination))) ?? destination
}

/** @internal */
export function copyFiles(
  matchers: Array<FileMatcher> | null,
  transformer: FileTransformer | null,
  isUseHardLink?: boolean,
  containment?: CopyFilesContainment | null
): Promise<any> {
  if (matchers == null || matchers.length === 0) {
    return Promise.resolve()
  }

  return Promise.all(
    matchers.map(async (matcher: FileMatcher) => {
      const fromStat = await statOrNull(matcher.from)
      if (fromStat == null) {
        log.warn({ from: matcher.from }, `file source doesn't exist`)
        return
      }

      const containmentRoot = containmentRootFor(matcher.to, containment)
      if (fromStat.isFile()) {
        const writes = new WriteContainment(containmentRoot, "copied file")
        const toStat = await statOrNull(matcher.to)
        // https://github.com/electron-userland/electron-builder/issues/1245
        if (toStat != null && toStat.isDirectory()) {
          const dest = path.join(matcher.to, path.basename(matcher.from))
          await writes.prepareFile(dest)
          return await copyOrLinkFile(matcher.from, dest, fromStat, isUseHardLink)
        }

        await writes.prepareFile(matcher.to)
        return await copyOrLinkFile(matcher.from, matcher.to, fromStat)
      }

      if (matcher.isEmpty() || matcher.containsOnlyIgnore()) {
        matcher.prependPattern("**/*")
      }
      log.debug({ matcher }, "copying files using pattern")
      return await copyDir(matcher.from, matcher.to, {
        filter: matcher.createFilter(),
        transformer,
        isUseHardLink: isUseHardLink ? USE_HARD_LINKS : null,
        containmentRoot,
        allowedSymlinkRoots: containment?.allowedSymlinkRoots,
        externalLinks: containment?.externalLinks,
      })
    })
  )
}
