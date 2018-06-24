import BluebirdPromise from "bluebird-lst"
import { CONCURRENCY, Filter } from "builder-util/out/fs"
import { lstat, readdir, readlink, stat, Stats } from "fs-extra-p"
import * as path from "path"
import { excludedNames, FileMatcher } from "../fileMatcher"
import { Packager } from "../packager"
import { resolveFunction } from "../platformPackager"

const excludedFiles = new Set([".DS_Store", "node_modules" /* already in the queue */, "CHANGELOG.md", "ChangeLog", "changelog.md", "binding.gyp", ".npmignore"].concat(excludedNames.split(",")))
const topLevelExcludedFiles = new Set(["test.js", "karma.conf.js", ".coveralls.yml", "README.md", "readme.markdown", "README", "readme.md", "readme", "test", "__tests__", "tests", "powered-test", "example", "examples"])

/** @internal */
export class NodeModuleCopyHelper {
  readonly metadata = new Map<string, Stats>()
  readonly filter: Filter | null

  constructor(private readonly matcher: FileMatcher, protected readonly packager: Packager) {
    this.filter = matcher.isEmpty() ? null : matcher.createFilter()
  }

  protected handleFile(file: string, fileStat: Stats): Promise<Stats | null> | null {
    if (!fileStat.isSymbolicLink()) {
      return null
    }

    return readlink(file)
      .then((linkTarget): any => {
        // http://unix.stackexchange.com/questions/105637/is-symlinks-target-relative-to-the-destinations-parent-directory-and-if-so-wh
        return this.handleSymlink(fileStat, file, path.resolve(path.dirname(file), linkTarget))
      })
  }

  protected handleSymlink(fileStat: Stats, file: string, linkTarget: string): Promise<Stats> | null {
    const link = path.relative(this.matcher.from, linkTarget)
    if (link.startsWith("..")) {
      // outside of project, linked module (https://github.com/electron-userland/electron-builder/issues/675)
      return stat(linkTarget)
        .then(targetFileStat => {
          this.metadata.set(file, targetFileStat)
          return targetFileStat
        })
    }
    else {
      (fileStat as any).relativeLink = link
    }
    return null
  }

  async collectNodeModules(baseDir: string, moduleNames: Iterable<string>, nodeModuleExcludedExts: Array<string>): Promise<Array<string>> {
    const filter = this.filter
    const metadata = this.metadata

    const onNodeModuleFile = resolveFunction(this.packager.config.onNodeModuleFile)

    const result: Array<string> = []
    const queue: Array<string> = []
    for (const moduleName of moduleNames) {
      const tmpPath = baseDir + path.sep + moduleName
      queue.length = 1
      // The path should be corrected in Windows that when the moduleName is Scoped packages named.
      const depPath = path.normalize(tmpPath)
      queue[0] = depPath

      // if (dep.link != null) {
      //   this.metadata.set(dep.path, dep.stat!)
      //   const r = this.handleSymlink(dep.stat!, dep.path, dep.link!)
      //   if (r != null) {
      //     await r
      //   }
      // }

      while (queue.length > 0) {
        const dirPath = queue.pop()!

        const childNames = await readdir(dirPath)
        childNames.sort()

        const isTopLevel = dirPath === depPath
        const dirs: Array<string> = []
        // our handler is async, but we should add sorted files, so, we add file to result not in the mapper, but after map
        const sortedFilePaths = await BluebirdPromise.map(childNames, name => {
          if (onNodeModuleFile != null) {
            onNodeModuleFile(dirPath + path.sep + name)
          }

          // do not exclude *.h files (https://github.com/electron-userland/electron-builder/issues/2852)
          if (excludedFiles.has(name) || name.startsWith("._")) {
            return null
          }

          for (const ext of nodeModuleExcludedExts) {
            if (name.endsWith(ext)) {
              return null
            }
          }

          // noinspection SpellCheckingInspection
          if (isTopLevel && (topLevelExcludedFiles.has(name) || (moduleName === "libui-node" && (name === "build" || name === "docs" || name === "src")))) {
            return null
          }

          if (dirPath.endsWith("build")) {
            if (name === "gyp-mac-tool" || name === "Makefile" || name.endsWith(".mk") || name.endsWith(".gypi") || name.endsWith(".Makefile")) {
              return null
            }
          }
          else if (dirPath.endsWith("Release") && (name === ".deps" || name === "obj.target")) {
            return null
          }
          else if (name === "src" && (dirPath.endsWith("keytar") || dirPath.endsWith("keytar-prebuild"))) {
            return null
          }
          else if (dirPath.endsWith("lzma-native") && (name === "build" || name === "deps")) {
            return null
          }

          const filePath = dirPath + path.sep + name
          return lstat(filePath)
            .then(stat => {
              if (filter != null && !filter(filePath, stat)) {
                return null
              }

              if (!stat.isDirectory()) {
                metadata.set(filePath, stat)
              }
              const consumerResult = this.handleFile(filePath, stat)
              if (consumerResult == null) {
                if (stat.isDirectory()) {
                  dirs.push(name)
                  return null
                }
                else {
                  return filePath
                }
              }
              else {
                return consumerResult
                  .then(it => {
                    // asarUtil can return modified stat (symlink handling)
                    if ((it == null ? stat : it).isDirectory()) {
                      dirs.push(name)
                      return null
                    }
                    else {
                      return filePath
                    }
                  })
              }
            })
        }, CONCURRENCY)

        for (const child of sortedFilePaths) {
          if (child != null) {
            result.push(child)
          }
        }

        dirs.sort()
        for (const child of dirs) {
          queue.push(dirPath + path.sep + child)
        }
      }
    }
    return result
  }
}