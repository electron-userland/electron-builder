import { copy } from "fs-extra-p"
import { Minimatch } from "minimatch"
import { exec } from "./util"
import * as path from "path"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

// we use relative path to avoid canonical path issue - e.g. /tmp vs /private/tmp
export function copyFiltered(src: string, destination: string, filter: (file: string) => boolean, dereference: boolean): Promise<any> {
  return copy(src, destination, {
    dereference: dereference,
    filter: filter
  })
}

export function hasMagic(pattern: Minimatch) {
  const set = pattern.set
  if (set.length > 1) {
    return true
  }

  for (let i of set[0]) {
    if (typeof i !== "string") {
      return true
    }
  }

  return false
}

export function createFilter(src: string, patterns: Array<Minimatch>, ignoreFiles?: Set<string>, rawFilter?: (file: string) => boolean, excludePatterns?: Array<Minimatch> | null): (file: string) => boolean {
  return function filter(it) {
    if (src === it) {
      return true
    }

    if (rawFilter != null && !rawFilter(it)) {
      return false
    }

    let relative = it.substring(src.length + 1)

    // yes, check before path sep normalization
    if (ignoreFiles != null && ignoreFiles.has(relative)) {
      return false
    }

    if (path.sep === "\\") {
      relative = relative.replace(/\\/g, "/")
    }

    return minimatchAll(relative, patterns) && (excludePatterns == null || !minimatchAll(relative, excludePatterns))
  }
}

export async function listDependencies(appDir: string, production: boolean): Promise<Array<string>> {
  let npmExecPath = process.env.npm_execpath || process.env.NPM_CLI_JS
  const npmExecArgs = ["ls", production ? "--production" : "--dev", "--parseable"]
  if (npmExecPath == null) {
    npmExecPath = process.platform === "win32" ? "npm.cmd" : "npm"
  }
  else {
    npmExecArgs.unshift(npmExecPath)
    npmExecPath = process.env.npm_node_execpath || process.env.NODE_EXE || "node"
  }

  const result = (await exec(npmExecPath, npmExecArgs, {
    cwd: appDir,
    stdio: "inherit",
    maxBuffer: 1024 * 1024,
  })).trim().split("\n")
  if (result.length > 0 && !result[0].includes("/node_modules/")) {
    // first line is a project dir
    const lastIndex = result.length - 1
    result[0] = result[lastIndex]
    result.length = result.length - 1
  }
  return result
}

// https://github.com/joshwnj/minimatch-all/blob/master/index.js
function minimatchAll(path: string, patterns: Array<Minimatch>): boolean {
  let match = false
  for (let pattern of patterns) {
    // If we've got a match, only re-test for exclusions.
    // if we don't have a match, only re-test for inclusions.
    if (match !== pattern.negate) {
      continue
    }

    // partial match — pattern: foo/bar.txt path: foo — we must allow foo
    // use it only for non-negate patterns: const m = new Minimatch("!node_modules/@(electron-download|electron)/**/*", {dot: true }); m.match("node_modules", true) will return false, but must be true
    match = pattern.match(path, !pattern.negate)
  }
  return match
}