import { FileConsumer, Filter, FilterStats } from "builder-util"
import { readlink, stat, Stats } from "fs-extra"
import * as path from "path"
import { FileMatcher } from "../fileMatcher.js"
import { Packager } from "../packager.js"

function addAllPatternIfNeed(matcher: FileMatcher) {
  if (!matcher.isSpecifiedAsEmptyArray && (matcher.isEmpty() || matcher.containsOnlyIgnore())) {
    matcher.prependPattern("**/*")
  }
  return matcher
}

export abstract class FileCopyHelper {
  readonly metadata = new Map<string, Stats>()

  protected constructor(
    protected readonly matcher: FileMatcher,
    readonly filter: Filter | null,
    protected readonly packager: Packager
  ) {}

  protected handleFile(file: string, parent: string, fileStat: Stats): Promise<Stats | null> | null {
    if (!fileStat.isSymbolicLink()) {
      return null
    }

    return readlink(file).then((linkTarget): any => {
      // http://unix.stackexchange.com/questions/105637/is-symlinks-target-relative-to-the-destinations-parent-directory-and-if-so-wh
      return this.handleSymlink(fileStat, file, parent, linkTarget)
    })
  }

  private handleSymlink(fileStat: Stats, file: string, parent: string, linkTarget: string): Promise<Stats> | null {
    const resolvedLinkTarget = path.resolve(parent, linkTarget)
    const link = path.relative(this.matcher.from, resolvedLinkTarget)
    if (link.startsWith("..")) {
      // outside of project, linked module (https://github.com/electron-userland/electron-builder/issues/675)
      return stat(resolvedLinkTarget).then(targetFileStat => {
        this.metadata.set(file, targetFileStat)
        return targetFileStat
      })
    } else {
      const s: FilterStats = fileStat
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
  return matcher.createFilter()
}

/** @internal */
export class AppFileWalker extends FileCopyHelper implements FileConsumer {
  readonly matcherFilter: any
  constructor(matcher: FileMatcher, packager: Packager) {
    super(addAllPatternIfNeed(matcher), createAppFilter(matcher, packager), packager)
    this.matcherFilter = matcher.createFilter()
  }

  // noinspection JSUnusedGlobalSymbols
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  consume(file: string, fileStat: Stats, parent: string, siblingNames: Array<string>): any {
    if (fileStat.isDirectory()) {
      const matchesFilter = this.matcherFilter(file, fileStat)
      return !matchesFilter
    } else {
      // save memory - no need to store stat for directory
      this.metadata.set(file, fileStat)
    }

    return this.handleFile(file, parent, fileStat)
  }
}
