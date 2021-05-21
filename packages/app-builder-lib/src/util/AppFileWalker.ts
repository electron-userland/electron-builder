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

  protected constructor(protected readonly matcher: FileMatcher, readonly filter: Filter | null, protected readonly packager: Packager) {}

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
      const s = fileStat as any
      s.relativeLink = link
      s.linkRelativeToFile = path.relative(parent, resolvedLinkTarget)
    }
    return null
  }
}

function createAppFilter(matcher: FileMatcher, packager: Packager): Filter | null {
    //  @ts-ignore
    const includeSubNodeModules = (packager._configuration || {}).includeSubNodeModules;

    //  for the places where we want to use the matcher to process node_modules
    //  directories (i.e. when includeSubNodeModules is off), we have to
    //  configure the matcher to act *exactly* like how it would according to
    //  how the system currently works: filter out all node_modules directories
    //  *except* the 'root' node_modules directory. We do this by finding the
    //  universal '*/**' rule and splice in two rules that do that filtering.
    //  then the user's rules that come after these rules can modify this
    //  behavior to add specific node_modules directories in.
    matcher.patterns.splice(
      matcher.patterns.indexOf('*/**') + 1, 0, '!**/node_modules', '*/node_modules')

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
    const matchesFilter = filter(file, fileStat)
    if (!nodeModulesFilter(file, fileStat)) {
      //  it's a node_modules directory

      //  if includeSubNodeModules is true, then we just return true - we want
      //  all of them
      if (includeSubNodeModules) {
        return true
      }
    }
    return matchesFilter
  }
}

/** @internal */
export class AppFileWalker extends FileCopyHelper implements FileConsumer {
  readonly includeSubNodeModules: boolean
  readonly matcherFilter

  constructor(matcher: FileMatcher, packager: Packager) {
    super(addAllPatternIfNeed(matcher), createAppFilter(matcher, packager), packager)
    //  @ts-ignore
    this.includeSubNodeModules = (packager._configuration || {}).includeSubNodeModules;
    this.matcherFilter = matcher.createFilter()
  }

  // noinspection JSUnusedGlobalSymbols
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  consume(file: string, fileStat: Stats, parent: string, siblingNames: Array<string>): any {
    if (fileStat.isDirectory()) {
      // https://github.com/electron-userland/electron-builder/issues/1539
      // but do not filter if we inside node_modules dir
      // update: solution disabled, node module resolver should support such setup
      if (file.endsWith(nodeModulesSystemDependentSuffix)) {
        //  it's a node_modules directory

        //  if includeSubNodeModules is true, then we just do nothing - we
        //  definitely want it. But if its false (the default), then we match
        //  and if the match is false, we return false (but if the match is
        //  true, we do nothing).
        if (!this.includeSubNodeModules) {
          const matchesFilter = this.matcherFilter(file, fileStat)
          //  if it matched the patterns filter, then we just do nothing - we
          //  want it. Otherwise, it didn't match the filter so we need to
          //  return false here.
          if (!matchesFilter) {
            return false
          }
        }
      }
    } else {
      // save memory - no need to store stat for directory
      this.metadata.set(file, fileStat)
    }

    return this.handleFile(file, parent, fileStat)
  }
}
