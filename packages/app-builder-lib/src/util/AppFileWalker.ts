import { Filter, FileConsumer } from "builder-util/out/fs"
import { readlink, stat, Stats } from "fs-extra"
import { FileMatcher } from "../fileMatcher"
import { Packager } from "../packager"
import * as path from "path"

const nodeModulesSystemDependentSuffix = `${path.sep}node_modules`

function addAllPatternIfNeed(matcher: FileMatcher) {
  if (!matcher.isSpecifiedAsEmptyArray && (matcher.isEmpty() || matcher.containsOnlyIgnore())) {
    matcher.prependPattern("**/*")
  }
  return matcher
}

export abstract class FileCopyHelper {
  readonly metadata = new Map<string, Stats>()

  protected constructor(protected readonly matcher: FileMatcher, readonly filter: Filter | null, protected readonly packager: Packager) {
  }

  protected handleFile(file: string, parent: string, fileStat: Stats): Promise<Stats | null> | null {
    if (!fileStat.isSymbolicLink()) {
      return null
    }

    return readlink(file)
      .then((linkTarget): any => {
        // http://unix.stackexchange.com/questions/105637/is-symlinks-target-relative-to-the-destinations-parent-directory-and-if-so-wh
        return this.handleSymlink(fileStat, file, parent, linkTarget)
      })
  }

  private handleSymlink(fileStat: Stats, file: string, parent: string, linkTarget: string): Promise<Stats> | null {
    const resolvedLinkTarget = path.resolve(parent, linkTarget)
    const link = path.relative(this.matcher.from, resolvedLinkTarget)
    if (link.startsWith("..")) {
      // outside of project, linked module (https://github.com/electron-userland/electron-builder/issues/675)
      return stat(resolvedLinkTarget)
        .then(targetFileStat => {
          this.metadata.set(file, targetFileStat)
          return targetFileStat
        })
    }
    else {
      const s = (fileStat as any)
      s.relativeLink = link
      s.linkRelativeToFile = path.relative(parent, resolvedLinkTarget)
    }
    return null
  }
}

function createAppFilter(matcher: FileMatcher, packager: Packager): Filter | null {
  if (packager.areNodeModulesHandledExternally) {
    return matcher.isEmpty() ? null : matcher.createFilter()
  }

  const nodeModulesFilter: Filter = (file, fileStat) => {
    return !(fileStat.isDirectory() && file.endsWith(nodeModulesSystemDependentSuffix))
  }

  if (matcher.isEmpty()) {
    return nodeModulesFilter
  }

  const filter = matcher.createFilter()
  return (file, fileStat) => {
    if (!nodeModulesFilter(file, fileStat)) {
      return false
    }
    return filter(file, fileStat)
  }
}

/** @internal */
export class AppFileWalker extends FileCopyHelper implements FileConsumer {
  constructor(matcher: FileMatcher, packager: Packager) {
    super(addAllPatternIfNeed(matcher), createAppFilter(matcher, packager), packager)
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

    return this.handleFile(file, parent, fileStat)
  }
}