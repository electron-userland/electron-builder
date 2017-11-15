import { Filter } from "builder-util/out/fs"
import { Stats } from "fs-extra-p"
import { Minimatch } from "minimatch"
import * as path from "path"
import { ensureEndSlash } from "./AppFileCopierHelper"

/** @internal */
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

/** @internal */
export function createFilter(src: string, patterns: Array<Minimatch>, excludePatterns?: Array<Minimatch> | null): Filter {
  const pathSeparator = path.sep
  const srcWithEndSlash = ensureEndSlash(src)
  return (it, stat) => {
    if (src === it) {
      return true
    }

    let relative = it.substring(srcWithEndSlash.length)
    if (pathSeparator === "\\") {
      if (relative.startsWith("\\")) {
        // windows problem: double backslash, the above substring call removes root path with a single slash, so here can me some leftovers
        relative = relative.substring(1)
      }
      relative = relative.replace(/\\/g, "/")
    }

    // https://github.com/electron-userland/electron-builder/issues/867
    return minimatchAll(relative, patterns, stat) && (excludePatterns == null || stat.isDirectory() || !minimatchAll(relative, excludePatterns, stat))
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
