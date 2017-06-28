import BluebirdPromise from "bluebird-lst"
import { asArray, debug, warn } from "electron-builder-util"
import { copyDir, copyOrLinkFile, Filter, statOrNull } from "electron-builder-util/out/fs"
import { mkdirs } from "fs-extra-p"
import { Minimatch } from "minimatch"
import * as path from "path"
import { Platform } from "./core"
import { hasDep } from "./fileTransformer"
import { Config, FilePattern, PlatformSpecificBuildOptions } from "./metadata"
import { PlatformPackager } from "./platformPackager"
import { createFilter, hasMagic } from "./util/filter"

/** @internal */
export class FileMatcher {
  readonly from: string
  readonly to: string

  readonly patterns: Array<string>

  constructor(from: string, to: string, private readonly macroExpander: (pattern: string) => string, patterns?: Array<string> | string | n) {
    this.from = macroExpander(from)
    this.to = macroExpander(to)
    this.patterns = asArray(patterns).map(it => this.normalizePattern(it))
  }

  normalizePattern(pattern: string) {
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
    // https://github.com/electron-userland/electron-builder/issues/733
    const minimatchOptions = {dot: true}

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

  createFilter(ignoreFiles?: Set<string>, rawFilter?: (file: string) => boolean, excludePatterns?: Array<Minimatch> | n): Filter {
    const parsedPatterns: Array<Minimatch> = []
    this.computeParsedPatterns(parsedPatterns)
    return createFilter(this.from, parsedPatterns, ignoreFiles, rawFilter, excludePatterns)
  }

  toString() {
    return `from: ${this.from}, to: ${this.to}, patterns: ${this.patterns.join(", ")}`
  }
}

/** @internal */
export function createFileMatcher(appDir: string, resourcesPath: string, macroExpander: (pattern: string) => string, platformSpecificBuildOptions: PlatformSpecificBuildOptions, packager: PlatformPackager<any>, outDir: string) {
  const buildResourceDir = path.resolve(packager.info.projectDir, packager.buildResourcesDir)

  const matchers = packager.info.isPrepackedAppAsar ? null : getFileMatchers(packager.info.config, "files", appDir, path.join(resourcesPath, "app"), false, macroExpander, platformSpecificBuildOptions)
  const matcher = matchers == null ? new FileMatcher(appDir, path.join(resourcesPath, "app"), macroExpander) : matchers[0]

  // https://github.com/electron-userland/electron-builder/issues/1741#issuecomment-311111418 so, do not use inclusive patterns

  const patterns = matcher.patterns

  const customFirstPatterns: Array<string> = []
  if (matcher.isEmpty() || matcher.containsOnlyIgnore()) {
    customFirstPatterns.push("**/*")
  }
  else {
    // prependPattern - user pattern should be after to be able to override
    // do not use **/node_modules/**/* because if pattern starts with **, all not explicitly excluded directories will be traversed (performance + empty dirs will be included into the asar)
    customFirstPatterns.push("node_modules/**/*")
    patterns.push("package.json")
  }

  // https://github.com/electron-userland/electron-builder/issues/1482
  const relativeBuildResourceDir = path.relative(matcher.from, buildResourceDir)
  if (relativeBuildResourceDir.length !== 0 && !relativeBuildResourceDir.startsWith(".")) {
    customFirstPatterns.push(`!${relativeBuildResourceDir}{,/**/*}`)
  }

  const relativeOutDir = matcher.normalizePattern(path.relative(packager.info.projectDir, outDir))
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

  if (packager.platform !== Platform.WINDOWS) {
    // https://github.com/electron-userland/electron-builder/issues/1738
    patterns.push("!**/node_modules/**/*.{dll,exe}")
  }

  // https://github.com/electron-userland/electron-builder/issues/1738#issuecomment-310729208
  if (hasDep("lzma-native", packager.info)) {
    patterns.push("!**/node_modules/lzma-native/build{,/**/*}")
    patterns.push("!**/node_modules/lzma-native/deps{,/**/*}")
  }

  patterns.push("!**/node_modules/*/{CHANGELOG.md,ChangeLog,changelog.md,README.md,README,readme.md,readme,test,__tests__,tests,powered-test,example,examples,*.d.ts}")
  patterns.push("!**/node_modules/.bin")
  patterns.push(`!**/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}`)
  patterns.push("!**/._*")
  patterns.push("!**/electron-builder.{yaml,yml,json,json5,toml}")
  patterns.push("!**/node_modules/@types{,/**/*}")
  //noinspection SpellCheckingInspection
  patterns.push("!**/{.git,.hg,.svn,CVS,RCS,SCCS," +
    "__pycache__,.DS_Store,thumbs.db,.gitignore,.gitkeep,.gitattributes," +
    ".idea,.vs,.editorconfig,.flowconfig,.jshintrc,.eslintrc," +
    ".yarn-integrity,.yarn-metadata.json,yarn-error.log,yarn.lock,package-lock.json,npm-debug.log," +
    "appveyor.yml,.travis.yml,circle.yml,.nyc_output}")

  return matcher
}

/** @internal */
export function getFileMatchers(config: Config, name: "files" | "extraFiles" | "extraResources" | "asarUnpack", defaultSrc: string, defaultDestination: string, allowAdvancedMatching: boolean, macroExpander: (pattern: string) => string, customBuildOptions: PlatformSpecificBuildOptions): Array<FileMatcher> | null {
  const globalPatterns: Array<string | FilePattern> | string | n | FilePattern = (<any>config)[name]
  const platformSpecificPatterns: Array<string | FilePattern> | string | n = (<any>customBuildOptions)[name]

  const defaultMatcher = new FileMatcher(defaultSrc, defaultDestination, macroExpander)
  const fileMatchers: Array<FileMatcher> = []

  function addPatterns(patterns: Array<string | FilePattern> | string | n | FilePattern) {
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
      else if (allowAdvancedMatching) {
        const from = pattern.from == null ? defaultSrc : path.resolve(defaultSrc, pattern.from)
        const to = pattern.to == null ? defaultDestination : path.resolve(defaultDestination, pattern.to)
        fileMatchers.push(new FileMatcher(from, to, macroExpander, pattern.filter))
      }
      else {
        throw new Error(`Advanced file copying not supported for "${name}"`)
      }
    }
  }

  addPatterns(globalPatterns)
  addPatterns(platformSpecificPatterns)

  if (!defaultMatcher.isEmpty()) {
    // default matcher should be first in the array
    fileMatchers.unshift(defaultMatcher)
  }

  return fileMatchers.length === 0 ? null : fileMatchers
}

/** @internal */
export function copyFiles(patterns: Array<FileMatcher> | null): Promise<any> {
  if (patterns == null || patterns.length === 0) {
    return BluebirdPromise.resolve()
  }

  return BluebirdPromise.map(patterns, async pattern => {
    const fromStat = await statOrNull(pattern.from)
    if (fromStat == null) {
      warn(`File source ${pattern.from} doesn't exist`)
      return
    }

    if (fromStat.isFile()) {
      const toStat = await statOrNull(pattern.to)
      // https://github.com/electron-userland/electron-builder/issues/1245
      if (toStat != null && toStat.isDirectory()) {
        return await copyOrLinkFile(pattern.from, path.join(pattern.to, path.basename(pattern.from)), fromStat)
      }

      await mkdirs(path.dirname(pattern.to))
      return await copyOrLinkFile(pattern.from, pattern.to, fromStat)
    }

    if (pattern.isEmpty() || pattern.containsOnlyIgnore()) {
      pattern.prependPattern("**/*")
    }
    if (debug.enabled) {
      debug(`Copying files using pattern: ${pattern}`)
    }
    return await copyDir(pattern.from, pattern.to, pattern.createFilter())
  })
}