import { Filter, FilterStats } from "builder-util"
import { Minimatch } from "minimatch"
import * as path from "path"

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

// sometimes, destination may not contain path separator in the end (path to folder), but the src does. So let's ensure paths have path separators in the end
function ensureEndSlash(s: string) {
  return s.length === 0 || s.endsWith(path.sep) ? s : s + path.sep
}

function getRelativePath(file: string, srcWithEndSlash: string, stat: FilterStats) {
  let relative = stat.moduleFullFilePath || file.substring(srcWithEndSlash.length)
  if (path.sep === "\\") {
    if (relative.startsWith("\\")) {
      // windows problem: double backslash, the above substring call removes root path with a single slash, so here can me some leftovers
      relative = relative.substring(1)
    }
    relative = relative.replace(/\\/g, "/")
  }
  return relative
}

/** @internal */
export function createFilter(src: string, patterns: Array<Minimatch>, excludePatterns?: Array<Minimatch> | null): Filter {
  const srcWithEndSlash = ensureEndSlash(src)
  return (file, stat) => {
    if (src === file) {
      return true
    }

    let relative = getRelativePath(file, srcWithEndSlash, stat)

    // filter the root node_modules, but not a subnode_modules (like /appDir/others/foo/node_modules/blah)
    if (relative === "node_modules") {
      return false
    } else if (relative.endsWith("/node_modules")) {
      relative += "/"
    }

    // https://github.com/electron-userland/electron-builder/issues/867
    return minimatchAll(relative, patterns, stat) && (excludePatterns == null || stat.isDirectory() || !minimatchAll(relative, excludePatterns, stat))
  }
}

// https://github.com/joshwnj/minimatch-all/blob/master/index.js
function minimatchAll(path: string, patterns: Array<Minimatch>, stat: FilterStats): boolean {
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
