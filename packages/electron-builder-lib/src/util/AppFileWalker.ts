import { FileConsumer } from "builder-util/out/fs"
import { Stats } from "fs-extra-p"
import * as path from "path"
import { FileMatcher } from "../fileMatcher"
import { Packager } from "../packager"
import { NodeModuleCopyHelper } from "./NodeModuleCopyHelper"
import { getProductionDependencies } from "./packageDependencies"

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
      if (file.endsWith(nodeModulesSystemDependentSuffix) && !parent.includes("node_modules") && siblingNames.includes("package.json")) {
        return this.handleNodeModulesDir(file, parent)
      }
    }
    else {
      // save memory - no need to store stat for directory
      this.metadata.set(file, fileStat)
    }

    return this.handleFile(file, fileStat)
  }

  private handleNodeModulesDir(nodeModulesDir: string, parent: string) {
    const packager = this.packager
    const isMainNodeModules = parent === packager.appDir

    return (isMainNodeModules ? packager.productionDeps.value : getProductionDependencies(parent))
      .then(it => {
        if (packager.debugLogger.enabled) {
          packager.debugLogger.add(`productionDependencies.${parent}`, it.filter(it => it.path.startsWith(nodeModulesDir)).map(it => path.relative(nodeModulesDir, it.path)))
        }
        return this.collectNodeModules(it)
      })
  }
}