import BluebirdPromise from "bluebird-lst"
import { asArray, log } from "builder-util"
import { copyDir, copyOrLinkFile, Filter, statOrNull, FileTransformer, USE_HARD_LINKS } from "builder-util/out/fs"
import { ensureDir } from "fs-extra"
import { Minimatch } from "minimatch"
import * as path from "path"
import { Configuration, FileSet, Packager, PlatformSpecificBuildOptions } from "./index"
import { PlatformPackager } from "./platformPackager"
import { createFilter, hasMagic } from "./util/filter"

// https://github.com/electron-userland/electron-builder/issues/733
const minimatchOptions = {dot: true}

// noinspection SpellCheckingInspection
export const excludedNames = ".git,.hg,.svn,CVS,RCS,SCCS," +
  "__pycache__,.DS_Store,thumbs.db,.gitignore,.gitkeep,.gitattributes,.npmignore," +
  ".idea,.vs,.flowconfig,.jshintrc,.eslintrc,.circleci," +
  ".yarn-integrity,.yarn-metadata.json,yarn-error.log,yarn.lock,package-lock.json,npm-debug.log," +
  "appveyor.yml,.travis.yml,circle.yml,.nyc_output"

export const excludedExts = "iml,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,suo,xproj,cc,d.ts"

function ensureNoEndSlash(file: string): string {
  if (path.sep !== "/") {
    file = file.replace(/\//g, path.sep)
  }
  if (path.sep !== "\\") {
    file = file.replace(/\\/g, path.sep)
  }

  if (file.endsWith(path.sep)) {
    return file.substring(0, file.length - 1)
  }
  else {
    return file
  }
}

/** @internal */
export class FileMatcher {
  readonly from: string
  readonly to: string

  readonly patterns: Array<string>

  excludePatterns: Array<Minimatch> | null = null

  readonly isSpecifiedAsEmptyArray: boolean

  constructor(from: string, to: string, readonly macroExpander: (pattern: string) => string, patterns?: Array<string> | string | null | undefined) {
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
export function getMainFileMatchers(appDir: string, destination: string, macroExpander: (pattern: string) => string, platformSpecificBuildOptions: PlatformSpecificBuildOptions, platformPackager: PlatformPackager<any>, outDir: string, isElectronCompile: boolean): Array<FileMatcher> {
  const packager = platformPackager.info
  const buildResourceDir = path.resolve(packager.projectDir, packager.buildResourcesDir)

  let matchers = packager.isPrepackedAppAsar ? null : getFileMatchers(packager.config, "files", destination, {
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

  const customFirstPatterns: Array<string> = []
  // electron-webpack - we need to copy only package.json and node_modules from root dir (and these files are added by default), so, explicit empty array is specified
  if (!matcher.isSpecifiedAsEmptyArray && (matcher.isEmpty() || matcher.containsOnlyIgnore())) {
    customFirstPatterns.push("**/*")
  }
  else if (!patterns.includes("package.json")) {
    patterns.push("package.json")
  }

  // https://github.com/electron-userland/electron-builder/issues/1482
  const relativeBuildResourceDir = path.relative(matcher.from, buildResourceDir)
  if (relativeBuildResourceDir.length !== 0 && !relativeBuildResourceDir.startsWith(".")) {
    customFirstPatterns.push(`!${relativeBuildResourceDir}{,/**/*}`)
  }

  const relativeOutDir = matcher.normalizePattern(path.relative(packager.projectDir, outDir))
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

  patterns.push(`!**/*.{${excludedExts}${packager.config.includePdb === true ? "" : ",pdb"}`)
  patterns.push("!**/._*")
  patterns.push("!**/electron-builder.{yaml,yml,json,json5,toml}")
  patterns.push(`!**/{${excludedNames}}`)

  if (isElectronCompile) {
    patterns.push("!.cache{,/**/*}")
  }

  // https://github.com/electron-userland/electron-builder/issues/1969
  // exclude ony for app root, use .yarnclean to clean node_modules
  patterns.push("!.editorconfig")

  const debugLogger = packager.debugLogger
  if (debugLogger.isEnabled) {
    //tslint:disable-next-line:no-invalid-template-strings
    debugLogger.add(`${macroExpander("${arch}")}.firstOrDefaultFilePatterns`, patterns)
  }
  return matchers
}

/** @internal */
export function getNodeModuleFileMatcher(appDir: string, destination: string, macroExpander: (pattern: string) => string, platformSpecificBuildOptions: PlatformSpecificBuildOptions, packager: Packager): FileMatcher {
  // https://github.com/electron-userland/electron-builder/pull/2948#issuecomment-392241632
  // grab only excludes
  const matcher = new FileMatcher(appDir, destination, macroExpander)

  function addPatterns(patterns: Array<string | FileSet> | string | null | undefined | FileSet) {
    if (patterns == null) {
      return
    }
    else if (!Array.isArray(patterns)) {
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
      }
      else {
        const fileSet = (pattern as FileSet)
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

/** @internal */
export function getFileMatchers(config: Configuration, name: "files" | "extraFiles" | "extraResources" | "asarUnpack" | "extraDistFiles", defaultDestination: string, options: GetFileMatchersOptions): Array<FileMatcher> | null {
  const defaultMatcher = new FileMatcher(options.defaultSrc, defaultDestination, options.macroExpander)
  const fileMatchers: Array<FileMatcher> = []

  function addPatterns(patterns: Array<string | FileSet> | string | null | undefined | FileSet) {
    if (patterns == null) {
      return
    }
    else if (!Array.isArray(patterns)) {
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
      }
      else if (name === "asarUnpack") {
        throw new Error(`Advanced file copying not supported for "${name}"`)
      }
      else {
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

  return BluebirdPromise.map(matchers, async (matcher: FileMatcher) => {
    const fromStat = await statOrNull(matcher.from)
    if (fromStat == null) {
      log.warn({from: matcher.from}, `file source doesn't exist`)
      return
    }

    if (fromStat.isFile()) {
      const toStat = await statOrNull(matcher.to)
      // https://github.com/electron-userland/electron-builder/issues/1245
      if (toStat != null && toStat.isDirectory()) {
        return await copyOrLinkFile(matcher.from, path.join(matcher.to, path.basename(matcher.from)), fromStat, isUseHardLink)
      }

      await ensureDir(path.dirname(matcher.to))
      return await copyOrLinkFile(matcher.from, matcher.to, fromStat)
    }

    if (matcher.isEmpty() || matcher.containsOnlyIgnore()) {
      matcher.prependPattern("**/*")
    }
    log.debug({matcher}, "copying files using pattern")
    return await copyDir(matcher.from, matcher.to, {filter: matcher.createFilter(), transformer, isUseHardLink: isUseHardLink ? USE_HARD_LINKS : null})
  })
}