import { Stats } from "fs-extra-p"
import { Minimatch } from "minimatch"
import * as path from "path"
import { Filter } from "./fs"

export function hasMagic(pattern: Minimatch) {
  const set = pattern.set
  if (set.length > 1) {
    return true
  }

  for (const i of set[0]) {
    if (typeof i !== "string") {
      return true
    }
  }

  return false
}

export function createFilter(src: string, patterns: Array<Minimatch>, ignoreFiles?: Set<string>, rawFilter?: (file: string) => boolean, excludePatterns?: Array<Minimatch> | null): Filter {
  return function (it, stat) {
    if (src === it) {
      return true
    }

    if (rawFilter != null && !rawFilter(it)) {
      return false
    }

    // yes, check before path sep normalization
    if (ignoreFiles != null && ignoreFiles.has(it)) {
      return false
    }

    let relative = it.substring(src.length + 1)
    if (path.sep === "\\") {
      relative = relative.replace(/\\/g, "/")
    }

    return minimatchAll(relative, patterns, stat) && (excludePatterns == null || !minimatchAll(relative, excludePatterns, stat))
  }
}

// https://github.com/joshwnj/minimatch-all/blob/master/index.js
function minimatchAll(path: string, patterns: Array<Minimatch>, stat: Stats): boolean {
  let match = false
  for (const pattern of patterns) {
    // If we've got a match, only re-test for exclusions.
    // if we don't have a match, only re-test for inclusions.
    if (match !== pattern.negate) {
      continue
    }

    // partial match — pattern: foo/bar.txt path: foo — we must allow foo
    // use it only for non-negate patterns: const m = new Minimatch("!node_modules/@(electron-download|electron)/**/*", {dot: true }); m.match("node_modules", true) will return false, but must be true
    match = pattern.match(path, stat.isDirectory() && !pattern.negate)
  }
  return match
}