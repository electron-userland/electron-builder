import BluebirdPromise from "bluebird-lst"
import { log } from "builder-util"
import { CONCURRENCY, FileTransformer, statOrNull, walk } from "builder-util/out/fs"
import { ensureDir, Stats } from "fs-extra-p"
import * as path from "path"
import { FileMatcher } from "../fileMatcher"
import { createElectronCompilerHost, NODE_MODULES_PATTERN } from "../fileTransformer"
import { Packager } from "../packager"
import { AppFileWalker } from "./AppFileWalker"
import { NodeModuleCopyHelper } from "./NodeModuleCopyHelper"
import { Dependency } from "./packageDependencies"

// os path separator is used
export interface ResolvedFileSet {
  src: string
  destination: string

  files: Array<string>
  metadata: Map<string, Stats>
  transformedFiles?: Map<number, string | Buffer> | null
}

export async function computeFileSets(matchers: Array<FileMatcher>, transformer: FileTransformer | null, packager: Packager, isElectronCompile: boolean): Promise<Array<ResolvedFileSet>> {
  const fileSets: Array<ResolvedFileSet> = []
  let hoistedNodeModuleFileSets: Array<ResolvedFileSet> | null = null
  let isHoistedNodeModuleChecked = false
  for (const matcher of matchers) {
    const fileWalker = new AppFileWalker(matcher, packager)

    const fromStat = await statOrNull(matcher.from)
    if (fromStat == null) {
      log.debug({directory: matcher.from, reason: "doesn't exist"}, `skipped copying`)
      continue
    }

    const files = await walk(matcher.from, fileWalker.filter, fileWalker)
    const metadata = fileWalker.metadata

    // https://github.com/electron-userland/electron-builder/issues/2205 Support for hoisted node_modules (lerna + yarn workspaces)
    if (!isHoistedNodeModuleChecked && matcher.from === packager.appDir) {
      isHoistedNodeModuleChecked = true

      // in the prepacked mode no package.json
      const packageJsonStat = await statOrNull(path.join(packager.appDir, "package.json"))
      if (packageJsonStat != null && packageJsonStat.isFile()) {
        hoistedNodeModuleFileSets = await copyHoistedNodeModules(packager, matcher)
      }
    }

    const transformedFiles = new Map<number, string | Buffer>()
    if (transformer != null) {
      await BluebirdPromise.filter(files, (it, index) => {
        const fileStat = metadata.get(it)
        if (fileStat == null || !fileStat.isFile()) {
          return false
        }

        const transformedValue = transformer(it)
        if (transformedValue == null) {
          return false
        }

        if (typeof transformedValue === "object" && "then" in transformedValue) {
          return (transformedValue as Promise<any>)
            .then(it => {
              if (it != null) {
                transformedFiles.set(index, it)
              }
              return false
            })
        }
        transformedFiles.set(index, transformedValue as string | Buffer)
        return false
      }, CONCURRENCY)
    }
    fileSets.push(validateFileSet({src: matcher.from, files, metadata, transformedFiles, destination: matcher.to}))
  }

  if (isElectronCompile) {
    // cache files should be first (better IO)
    fileSets.unshift(await compileUsingElectronCompile(fileSets[0], packager))
  }
  if (hoistedNodeModuleFileSets != null) {
    return fileSets.concat(hoistedNodeModuleFileSets)
  }
  return fileSets
}

function validateFileSet(fileSet: ResolvedFileSet): ResolvedFileSet {
  if (fileSet.src == null || fileSet.src.length === 0) {
    throw new Error("fileset src is empty")
  }
  return fileSet
}

async function copyHoistedNodeModules(packager: Packager, mainMatcher: FileMatcher): Promise<Array<ResolvedFileSet>> {
  const productionDeps = await packager.productionDeps.value
  const rootPathToCopier = new Map<string, Array<Dependency>>()
  for (const dep of productionDeps) {
    const index = dep.path.indexOf(NODE_MODULES_PATTERN)
    if (index < 0) {
      throw new Error("cannot find node_modules in the path " + dep.path)
    }

    const root = dep.path.substring(0, index)
    let list = rootPathToCopier.get(root)
    if (list == null) {
      list = []
      rootPathToCopier.set(root, list)
    }
    list.push(dep)
  }

  // mapSeries instead of map because copyNodeModules is concurrent and so, no need to increase queue/pressure
  return await BluebirdPromise.mapSeries(rootPathToCopier.keys(), async source => {
    // use main matcher patterns, so, user can exclude some files in such hoisted node modules
    const matcher = new FileMatcher(source, mainMatcher.to, mainMatcher.macroExpander, mainMatcher.patterns)
    const copier = new NodeModuleCopyHelper(matcher, packager)
    const files = await copier.collectNodeModules(rootPathToCopier.get(source)!!)
    return validateFileSet({src: matcher.from, destination: matcher.to, files, metadata: copier.metadata})
  })
}

const BOWER_COMPONENTS_PATTERN = `${path.sep}bower_components${path.sep}`
/** @internal */
export const ELECTRON_COMPILE_SHIM_FILENAME = "__shim.js"

async function compileUsingElectronCompile(mainFileSet: ResolvedFileSet, packager: Packager): Promise<ResolvedFileSet> {
  log.info("compiling using electron-compile")

  const electronCompileCache = await packager.tempDirManager.getTempDir({prefix: "electron-compile-cache"})
  const cacheDir = path.join(electronCompileCache, ".cache")
  // clear and create cache dir
  await ensureDir(cacheDir)
  const compilerHost = await createElectronCompilerHost(mainFileSet.src, cacheDir)
  const nextSlashIndex = mainFileSet.src.length + 1
  // pre-compute electron-compile to cache dir - we need to process only subdirectories, not direct files of app dir
  await BluebirdPromise.map(mainFileSet.files, file => {
    if (file.includes(NODE_MODULES_PATTERN) || file.includes(BOWER_COMPONENTS_PATTERN)
      || !file.includes(path.sep, nextSlashIndex) // ignore not root files
      || !mainFileSet.metadata.get(file)!.isFile()) {
      return null
    }
    return compilerHost.compile(file)
      .then(() => null)
  }, CONCURRENCY)

  await compilerHost.saveConfiguration()

  const metadata = new Map<string, Stats>()
  const cacheFiles = await walk(cacheDir, file => !file.startsWith("."), {
    consume: (file, fileStat) => {
      if (fileStat.isFile()) {
        metadata.set(file, fileStat)
      }
      return null
    }
  })

  // add shim
  const shimPath = `${mainFileSet.src}${path.sep}${ELECTRON_COMPILE_SHIM_FILENAME}`
  mainFileSet.files.push(shimPath)
  mainFileSet.metadata.set(shimPath, {isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false} as any)
  if (mainFileSet.transformedFiles == null) {
    mainFileSet.transformedFiles = new Map()
  }
  mainFileSet.transformedFiles.set(mainFileSet.files.length - 1, `
'use strict';
require('electron-compile').init(__dirname, require('path').resolve(__dirname, '${packager.metadata.main || "index"}'), true);
`)
  return {src: electronCompileCache, files: cacheFiles, metadata, destination: mainFileSet.destination}
}

// sometimes, destination may not contain path separator in the end (path to folder), but the src does. So let's ensure paths have path separators in the end
export function ensureEndSlash(s: string) {
  return s === "" || s.endsWith(path.sep) ? s : (s + path.sep)
}
