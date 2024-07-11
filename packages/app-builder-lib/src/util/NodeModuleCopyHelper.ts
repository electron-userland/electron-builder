import BluebirdPromise from "bluebird-lst"
import { CONCURRENCY } from "builder-util"
import { lstat, readdir } from "fs-extra"
import * as path from "path"
import { excludedNames, FileMatcher } from "../fileMatcher"
import { Packager } from "../packager"
import { resolveFunction } from "../platformPackager"
import { FileCopyHelper } from "./AppFileWalker"
import { NodeModuleInfo } from "./packageDependencies"

const excludedFiles = new Set(
  [".DS_Store", "node_modules" /* already in the queue */, "CHANGELOG.md", "ChangeLog", "changelog.md", "Changelog.md", "Changelog", "binding.gyp", ".npmignore"].concat(
    excludedNames.split(",")
  )
)
const topLevelExcludedFiles = new Set([
  "karma.conf.js",
  ".coveralls.yml",
  "README.md",
  "readme.markdown",
  "README",
  "readme.md",
  "Readme.md",
  "Readme",
  "readme",
  "test",
  "tests",
  "__tests__",
  "powered-test",
  "example",
  "examples",
  ".bin",
])

/** @internal */
export class NodeModuleCopyHelper extends FileCopyHelper {
  constructor(matcher: FileMatcher, packager: Packager) {
    super(matcher, matcher.isEmpty() ? null : matcher.createFilter(), packager)
  }

  async collectNodeModules(moduleInfo: NodeModuleInfo, nodeModuleExcludedExts: Array<string>): Promise<Array<string>> {
    const filter = this.filter
    const metadata = this.metadata

    const onNodeModuleFile = await resolveFunction(this.packager.appInfo.type, this.packager.config.onNodeModuleFile, "onNodeModuleFile")

    const result: Array<string> = []
    const queue: Array<string> = []
    const tmpPath = moduleInfo.dir
    const moduleName = moduleInfo.name
    queue.length = 1
    // The path should be corrected in Windows that when the moduleName is Scoped packages named.
    const depPath = path.normalize(tmpPath)
    queue[0] = depPath

    while (queue.length > 0) {
      const dirPath = queue.pop()!

      const childNames = await readdir(dirPath)
      childNames.sort()

      const isTopLevel = dirPath === depPath
      const dirs: Array<string> = []
      // our handler is async, but we should add sorted files, so, we add file to result not in the mapper, but after map
      const sortedFilePaths = await BluebirdPromise.map(
        childNames,
        name => {
          const filePath = path.join(dirPath, name)

          const forceIncluded = onNodeModuleFile != null && !!onNodeModuleFile(filePath)

          if (excludedFiles.has(name) || name.startsWith("._")) {
            return null
          }

          if (!forceIncluded) {
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
            } else if (dirPath.endsWith("Release") && (name === ".deps" || name === "obj.target")) {
              return null
            } else if (name === "src" && (dirPath.endsWith("keytar") || dirPath.endsWith("keytar-prebuild"))) {
              return null
            } else if (dirPath.endsWith("lzma-native") && (name === "build" || name === "deps")) {
              return null
            }
          }

          return lstat(filePath).then(stat => {
            if (filter != null && !filter(filePath, stat)) {
              return null
            }

            if (!stat.isDirectory()) {
              metadata.set(filePath, stat)
            }
            const consumerResult = this.handleFile(filePath, dirPath, stat)
            if (consumerResult == null) {
              if (stat.isDirectory()) {
                dirs.push(name)
                return null
              } else {
                return filePath
              }
            } else {
              return consumerResult.then(it => {
                // asarUtil can return modified stat (symlink handling)
                if ((it == null ? stat : it).isDirectory()) {
                  dirs.push(name)
                  return null
                } else {
                  return filePath
                }
              })
            }
          })
        },
        CONCURRENCY
      )

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
    return result
  }
}
