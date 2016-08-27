import * as path from "path"
import { createFilter, hasMagic, Filter } from "./util/filter"
import { Minimatch } from "minimatch"
import { asArray } from "./util/util"

export interface FilePattern {
  from?: string
  to?: string
  filter?: Array<string> | string
}

export interface FileMatchOptions {
  arch: string,
  os: string
}

export class FileMatcher {
  readonly from: string
  readonly to: string

  readonly patterns: Array<string>

  constructor(from: string, to: string, private options: FileMatchOptions, patterns?: Array<string> | string | n) {
    this.from = this.expandPattern(from)
    this.to = this.expandPattern(to)
    this.patterns = asArray(patterns)
  }

  addPattern(pattern: string) {
    this.patterns.push(pattern)
  }

  isEmpty() {
    return this.patterns.length === 0
  }

  getParsedPatterns(fromDir?: string): Array<Minimatch> {
    const minimatchOptions = {}

    const parsedPatterns: Array<Minimatch> = []
    const pathDifference = fromDir ? path.relative(fromDir, this.from) : null

    for (let i = 0; i < this.patterns.length; i++) {
      let expandedPattern = this.expandPattern(this.patterns[i])
      if (pathDifference) {
        expandedPattern = path.join(pathDifference, expandedPattern)
      }

      const parsedPattern = new Minimatch(expandedPattern, minimatchOptions)
      parsedPatterns.push(parsedPattern)

      if (!hasMagic(parsedPattern)) {
        // https://github.com/electron-userland/electron-builder/issues/545
        // add **/*
        parsedPatterns.push(new Minimatch(`${expandedPattern}/**/*`, minimatchOptions))
      }
    }

    return parsedPatterns
  }

  createFilter(ignoreFiles?: Set<string>, rawFilter?: (file: string) => boolean, excludePatterns?: Array<Minimatch> | n): Filter {
    return createFilter(this.from, this.getParsedPatterns(), ignoreFiles, rawFilter, excludePatterns)
  }

  private expandPattern(pattern: string): string {
    return pattern
      .replace(/\$\{arch}/g, this.options.arch)
      .replace(/\$\{os}/g, this.options.os)
      .replace(/\$\{\/\*}/g, "{,/**/*,/**/.*}")
  }
}

export function deprecatedUserIgnoreFilter(ignore: any, appDir: string) {
  let ignoreFunc: any
  if (typeof (ignore) === "function") {
    ignoreFunc = function (file: string) { return !ignore(file) }
  }
  else {
    if (!Array.isArray(ignore)) {
      ignore = [ignore]
    }

    ignoreFunc = function (file: string) {
      for (let i = 0; i < ignore.length; i++) {
        if (file.match(ignore[i])) {
          return false
        }
      }

      return true
    }
  }

  return function filter(file: string) {
    let name = file.split(path.resolve(appDir))[1]
    if (path.sep === "\\") {
      // convert slashes so unix-format ignores work
      name = name.replace(/\\/g, "/")
    }
    return ignoreFunc(name)
  }
}