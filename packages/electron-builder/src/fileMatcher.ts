import BluebirdPromise from "bluebird-lst"
import { asArray } from "electron-builder-util"
import { copyDir, copyFile, Filter, statOrNull } from "electron-builder-util/out/fs"
import { warn } from "electron-builder-util/out/log"
import { mkdirs } from "fs-extra-p"
import { Minimatch } from "minimatch"
import * as path from "path"
import { Macros } from "./metadata"
import { createFilter, hasMagic } from "./util/filter"

export class FileMatcher {
  readonly from: string
  readonly to: string

  readonly patterns: Array<string>

  constructor(from: string, to: string, private options: Macros, patterns?: Array<string> | string | n) {
    this.from = this.expandPattern(from)
    this.to = this.expandPattern(to)
    this.patterns = asArray(patterns).map(it => path.posix.normalize(it))
  }

  addPattern(pattern: string) {
    this.patterns.push(path.posix.normalize((pattern)))
  }

  addAllPattern() {
    // must be first, see minimatchAll implementation
    this.patterns.unshift("**/*")
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

    for (const p of this.patterns) {
      let expandedPattern = this.expandPattern(p)
      if (relativeFrom != null) {
        expandedPattern = path.join(relativeFrom, expandedPattern)
      }

      const parsedPattern = new Minimatch(expandedPattern, minimatchOptions)
      result.push(parsedPattern)

      if (!hasMagic(parsedPattern)) {
        // https://github.com/electron-userland/electron-builder/issues/545
        // add **/*
        result.push(new Minimatch(`${expandedPattern}/**/*`, minimatchOptions))
      }
    }
  }

  createFilter(ignoreFiles?: Set<string>, rawFilter?: (file: string) => boolean, excludePatterns?: Array<Minimatch> | n): Filter {
    const parsedPatterns: Array<Minimatch> = []
    this.computeParsedPatterns(parsedPatterns)
    return createFilter(this.from, parsedPatterns, ignoreFiles, rawFilter, excludePatterns)
  }

  private expandPattern(pattern: string): string {
    return pattern
      .replace(/\$\{arch}/g, this.options.arch!)
      .replace(/\$\{os}/g, this.options.os)
      .replace(/\$\{\/\*}/g, "{,/**/*}")
  }
}

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
        return await copyFile(pattern.from, path.join(pattern.to, path.basename(pattern.from)), fromStat)
      }

      await mkdirs(path.dirname(pattern.to))
      return await copyFile(pattern.from, pattern.to, fromStat)
    }

    if (pattern.isEmpty() || pattern.containsOnlyIgnore()) {
      pattern.addAllPattern()
    }
    return await copyDir(pattern.from, pattern.to, pattern.createFilter())
  })
}