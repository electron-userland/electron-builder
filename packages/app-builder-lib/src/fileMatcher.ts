import { asArray, copyDir, copyOrLinkFile, FileTransformer, Filter, log, statOrNull, USE_HARD_LINKS } from "builder-util"
import { Nullish } from "builder-util-runtime"
import { mkdir } from "fs/promises"
import { Minimatch } from "minimatch"
import * as path from "path"
import type { Configuration } from "./configuration.js"
import type { Packager } from "./packager.js"
import { FileSet, PlatformSpecificBuildOptions } from "./options/PlatformSpecificBuildOptions.js"
import { PlatformPackager } from "./platformPackager.js"
import { createFilter, hasMagic } from "./util/filter.js"

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

// File extensions (without leading dot) excluded by default from the packaged app.
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
]

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
 * Determines which default-excluded extensions and names a user has explicitly opted back in to via
 * their `files` patterns, so the corresponding defaults are not re-applied.
 *
 * A default is treated as opted back in only when a non-negated pattern references it concretely:
 * an extension when a pattern's basename ends with `.<ext>` (e.g. `**\/*.obj`, `assets/*.{obj,gltf}`,
 * `**\/*.d.ts`); a name when any path segment equals it (e.g. `**\/.github/**`, `**\/yarn.lock`).
 * Broad patterns such as `**\/*` reference nothing concrete and therefore opt nothing in.
 */
export function collectExplicitReincludes(patterns: ReadonlyArray<string>): { extensions: Set<string>; names: Set<string> } {
  const segments = new Set<string>()
  const basenames: Array<string> = []
  for (const pattern of patterns) {
    if (pattern.startsWith("!")) {
      continue
    }
    for (const expanded of expandBraces(pattern)) {
      const parts = expanded.split("/")
      for (const part of parts) {
        segments.add(part)
      }
      basenames.push(parts[parts.length - 1])
    }
  }

  const extensions = new Set(DEFAULT_EXCLUDED_EXTENSIONS.filter(ext => basenames.some(name => name.endsWith(`.${ext}`))))
  const names = new Set(DEFAULT_EXCLUDED_NAMES.filter(name => segments.has(name)))
  return { extensions, names }
}

/**
 * Builds the trailing list of default ignore globs appended to the main app file matcher. Extensions
 * and names the user has explicitly re-included (see {@link collectExplicitReincludes}) are omitted,
 * so a `files` entry like `**\/*.obj` overrides the matching built-in exclusion.
 */
export function getDefaultIgnoredPatterns(userPatterns: ReadonlyArray<string>, includePdb: boolean): Array<string> {
  const reincluded = collectExplicitReincludes(userPatterns)

  const extensions = DEFAULT_EXCLUDED_EXTENSIONS.filter(ext => !reincluded.extensions.has(ext))
  if (!includePdb) {
    extensions.push("pdb")
  }
  const names = DEFAULT_EXCLUDED_NAMES.filter(name => !reincluded.names.has(name))

  const patterns: Array<string> = []
  // minimatch does not expand a single-member brace (`{x}` is matched literally), so emit a bare
  // glob when only one extension/name survives the opt-in filtering.
  if (extensions.length === 1) {
    patterns.push(`!**/*.${extensions[0]}`)
  } else if (extensions.length > 1) {
    patterns.push(`!**/*.{${extensions.join(",")}}`)
  }
  patterns.push("!**/._*")
  patterns.push("!**/electron-builder.{yaml,yml,json,json5,toml,ts}")
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

  computeParsedPatterns(result: Array<Minimatch>, fromDir?: string): void {
    const relativeFrom = fromDir == null ? null : path.relative(fromDir, this.from)

    if (this.patterns.length === 0 && relativeFrom != null) {
      // file mappings, from here is a file
      result.push(new Minimatch(relativeFrom, minimatchOptions))
      return
    }

    for (let pattern of this.patterns) {
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
    return createFilter(this.from, parsedPatterns, this.excludePatterns)
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

  patterns.push(...getDefaultIgnoredPatterns(userSpecifiedPatterns, platformPackager.config.includePdb === true))

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

  addPatterns(packager.config.files)
  addPatterns(platformSpecificBuildOptions.files)

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
        const to = pattern.to == null ? defaultDestination : path.resolve(defaultDestination, pattern.to)
        fileMatchers.push(new FileMatcher(from, to, options.macroExpander, pattern.filter))
      }
    }
  }

  if (name !== "extraDistFiles") {
    addPatterns((config as any)[name])
  }
  addPatterns((options.customBuildOptions as any)[name])

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

/** @internal */
export function copyFiles(matchers: Array<FileMatcher> | null, transformer: FileTransformer | null, isUseHardLink?: boolean): Promise<any> {
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

      if (fromStat.isFile()) {
        const toStat = await statOrNull(matcher.to)
        // https://github.com/electron-userland/electron-builder/issues/1245
        if (toStat != null && toStat.isDirectory()) {
          return await copyOrLinkFile(matcher.from, path.join(matcher.to, path.basename(matcher.from)), fromStat, isUseHardLink)
        }

        await mkdir(path.dirname(matcher.to), { recursive: true })
        return await copyOrLinkFile(matcher.from, matcher.to, fromStat)
      }

      if (matcher.isEmpty() || matcher.containsOnlyIgnore()) {
        matcher.prependPattern("**/*")
      }
      log.debug({ matcher }, "copying files using pattern")
      return await copyDir(matcher.from, matcher.to, { filter: matcher.createFilter(), transformer, isUseHardLink: isUseHardLink ? USE_HARD_LINKS : null })
    })
  )
}
