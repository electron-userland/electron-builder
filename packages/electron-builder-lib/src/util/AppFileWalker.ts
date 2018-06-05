import { FileConsumer } from "builder-util/out/fs"
import { Stats } from "fs-extra-p"
import { FileMatcher } from "../fileMatcher"
import { Packager } from "../packager"
import { NodeModuleCopyHelper } from "./NodeModuleCopyHelper"
import * as path from "path"

const nodeModulesSystemDependentSuffix = `${path.sep}node_modules`

function addAllPatternIfNeed(matcher: FileMatcher) {
  if (!matcher.isSpecifiedAsEmptyArray && (matcher.isEmpty() || matcher.containsOnlyIgnore())) {
    matcher.prependPattern("**/*")
  }
  return matcher
}

/** @internal */
export class AppFileWalker extends NodeModuleCopyHelper implements FileConsumer {
  constructor(matcher: FileMatcher, packager: Packager) {
    super(addAllPatternIfNeed(matcher), packager)
  }

  // noinspection JSUnusedGlobalSymbols
  consume(file: string, fileStat: Stats, parent: string, siblingNames: Array<string>): any {
    if (fileStat.isDirectory()) {
      // https://github.com/electron-userland/electron-builder/issues/1539
      // but do not filter if we inside node_modules dir
      // update: solution disabled, node module resolver should support such setup
      if (file.endsWith(nodeModulesSystemDependentSuffix)) {
        return false
      }
    }
    else {
      // save memory - no need to store stat for directory
      this.metadata.set(file, fileStat)
    }

    return this.handleFile(file, fileStat)
  }
}