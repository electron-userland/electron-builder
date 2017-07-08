import BluebirdPromise from "bluebird-lst"
import { debug, log } from "electron-builder-util"
import { CONCURRENCY, FileConsumer, FileTransformer, Filter, walk } from "electron-builder-util/out/fs"
import { ensureDir, lstat, readdir, readlink, stat, Stats } from "fs-extra-p"
import * as path from "path"
import { createElectronCompilerHost } from "../fileTransformer"
import { Packager } from "../packager"
import { Dependency, getProductionDependencies } from "./packageDependencies"

export const NODE_MODULES_PATTERN = `${path.sep}node_modules${path.sep}`

const nodeModulesSystemDependentSuffix = `${path.sep}node_modules`
const excludedFiles = new Set([".DS_Store", "node_modules" /* already in the queue */, "CHANGELOG.md", "ChangeLog", "changelog.md", "binding.gyp"])

export interface FileSet {
  src: string
  files: Array<string>
  metadata: Map<string, Stats>
  transformedFiles: Array<string | Buffer | true | null>
}

export class AppFileCopierHelper {
  constructor(private readonly transformer: FileTransformer) {
  }

  async collect(fileWalker: AppFileWalker, isElectronCompile: boolean): Promise<Array<FileSet>> {
    const files = await walk(fileWalker.src, fileWalker.filter, fileWalker)
    const transformer = this.transformer
    const metadata = fileWalker.metadata
    const transformedFiles = await BluebirdPromise.map(files, it => {
      const fileStat = metadata.get(it)
      return fileStat != null && fileStat.isFile() ? transformer(it) : null
    }, CONCURRENCY)

    const mainFileSet: FileSet = {src: fileWalker.src, files, metadata: fileWalker.metadata, transformedFiles}
    const fileSets = [mainFileSet]
    if (isElectronCompile) {
      // cache should be first in the asar
      fileSets.unshift(await compileUsingElectronCompile(mainFileSet, fileWalker.packager))
    }
    return fileSets
  }
}

/** @internal */
export class AppFileWalker implements FileConsumer {
  readonly metadata = new Map<string, Stats>()

  constructor(readonly src: string, readonly packager: Packager, readonly filter: Filter) {
  }

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
    return (parent === this.packager.appDir ? this.packager.productionDeps.value : getProductionDependencies(parent))
      .then(it => {
        if (debug.enabled) {
          debug(`Production dependencies in the ${parent}: ${it.filter(it => it.path.startsWith(nodeModulesDir)).map(it => path.relative(nodeModulesDir, it.path)).join(", ")}`)
        }

        return this.copyNodeModules(it, this.filter, (file, fileStat) => {
          this.metadata.set(file, fileStat)
          return this.handleFile(file, fileStat)
        })
      })
  }

  private handleFile(file: string, fileStat: Stats) {
    if (!fileStat.isSymbolicLink()) {
      return null
    }

    return readlink(file)
      .then((linkTarget): any => {
        // http://unix.stackexchange.com/questions/105637/is-symlinks-target-relative-to-the-destinations-parent-directory-and-if-so-wh
        return this.handleSymlink(fileStat, file, path.resolve(path.dirname(file), linkTarget))
      })
  }

  private handleSymlink(fileStat: Stats, file: string, linkTarget: string) {
    const link = path.relative(this.src, linkTarget)
    if (link.startsWith("..")) {
      // outside of project, linked module (https://github.com/electron-userland/electron-builder/issues/675)
      return stat(linkTarget)
        .then(targetFileStat => {
          this.metadata.set(file, targetFileStat)
          return targetFileStat
        })
    }
    else {
      (<any>fileStat).relativeLink = link
    }
    return null
  }

  private async copyNodeModules(list: Array<Dependency>, filter: Filter | null | undefined, consumer: (file: string, stat: Stats, parent: string, siblingNames: Array<string>) => any): Promise<Array<string>> {
    const result: Array<string> = []
    const queue: Array<string> = []
    for (const dep of list) {
      queue.length = 1
      queue[0] = dep.path

      if (dep.link != null) {
        this.metadata.set(dep.path, dep.stat!)
        const r = this.handleSymlink(dep.stat!, dep.path, dep.link!)
        if (r != null) {
          await r
        }
      }

      while (queue.length > 0) {
        const dirPath = queue.pop()!

        const childNames = await readdir(dirPath)
        childNames.sort()

        const dirs: Array<string> = []
        // our handler is async, but we should add sorted files, so, we add file to result not in the mapper, but after map
        const sortedFilePaths = await BluebirdPromise.map(childNames, name => {
          if (excludedFiles.has(name) || name.endsWith(".h") || name.endsWith(".obj") || name.endsWith(".cc") || name.endsWith(".pdb") || name.endsWith(".d.ts")) {
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

              const consumerResult = consumer(filePath, stat, dirPath, childNames)
              if (consumerResult == null || !("then" in consumerResult)) {
                if (stat.isDirectory()) {
                  dirs.push(name)
                  return null
                }
                else {
                  return filePath
                }
              }
              else {
                return (<Promise<any>>consumerResult)
                  .then(it => {
                    // asarUtil can return modified stat (symlink handling)
                    if ((it != null && "isDirectory" in it ? (<Stats>it) : stat).isDirectory()) {
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

const BOWER_COMPONENTS_PATTERN = `${path.sep}bower_components${path.sep}`
/** @internal */
export const ELECTRON_COMPILE_SHIM_FILENAME = "__shim.js"

async function compileUsingElectronCompile(fileSet: FileSet, packager: Packager): Promise<FileSet> {
  log("Compiling using electron-compile")

  const electronCompileCache = await packager.tempDirManager.getTempFile("electron-compile-cache")
  const cacheDir = path.join(electronCompileCache, ".cache")
  // clear and create cache dir
  await ensureDir(cacheDir)
  const compilerHost = await createElectronCompilerHost(fileSet.src, cacheDir)
  const nextSlashIndex = fileSet.src.length + 1
  // pre-compute electron-compile to cache dir - we need to process only subdirectories, not direct files of app dir
  await BluebirdPromise.map(fileSet.files, file => {
    if (file.includes(NODE_MODULES_PATTERN) || file.includes(BOWER_COMPONENTS_PATTERN)
      || !file.includes(path.sep, nextSlashIndex) // ignore not root files
      || !fileSet.metadata.get(file)!.isFile()) {
      return null
    }
    return compilerHost.compile(file)
      .then((it: any) => null)
  }, CONCURRENCY)

  await compilerHost.saveConfiguration()

  const metadata = new Map<string, Stats>()
  const cacheFiles = await walk(cacheDir, (file, stat) => !file.startsWith("."), {
    consume: (file, fileStat) => {
      if (fileStat.isFile()) {
        metadata.set(file, fileStat)
      }
      return null
    }
  })

  // add shim
  const shimPath = `${fileSet.src}/${ELECTRON_COMPILE_SHIM_FILENAME}`
  cacheFiles.push(shimPath)
  metadata.set(shimPath, <any>{isFile: () => true, isDirectory: () => false})

  const transformedFiles = new Array(cacheFiles.length)
  transformedFiles[cacheFiles.length - 1] = `
'use strict';
require('electron-compile').init(__dirname, require('path').resolve(__dirname, '${packager.metadata.main || "index"}'), true);
`
  // cache files should be first (better IO)
  return {src: electronCompileCache, files: cacheFiles, transformedFiles, metadata}
}