import BluebirdPromise from "bluebird-lst"
import { log, executeAppBuilder } from "builder-util"
import { CONCURRENCY, FileTransformer, statOrNull, walk } from "builder-util/out/fs"
import { ensureDir, Stats } from "fs-extra-p"
import * as path from "path"
import { Platform } from "../core"
import { excludedExts, FileMatcher } from "../fileMatcher"
import { createElectronCompilerHost, NODE_MODULES_PATTERN } from "../fileTransformer"
import { Packager } from "../packager"
import { PlatformPackager } from "../platformPackager"
import { AppFileWalker } from "./AppFileWalker"
import { NodeModuleCopyHelper } from "./NodeModuleCopyHelper"

// os path separator is used
export interface ResolvedFileSet {
  src: string
  destination: string

  files: Array<string>
  metadata: Map<string, Stats>
  transformedFiles?: Map<number, string | Buffer> | null
}

async function transformFiles(transformer: FileTransformer | null, files: Array<string>, metadata: Map<string, Stats>): Promise<Map<number, string | Buffer>> {
  const transformedFiles = new Map<number, string | Buffer>()
  if (transformer == null) {
    return transformedFiles
  }

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
  return transformedFiles
}

export async function computeFileSets(matchers: Array<FileMatcher>, transformer: FileTransformer | null, platformPackager: PlatformPackager<any>, isElectronCompile: boolean): Promise<Array<ResolvedFileSet>> {
  const fileSets: Array<ResolvedFileSet> = []
  const packager = platformPackager.info

  for (const matcher of matchers) {
    const fileWalker = new AppFileWalker(matcher, packager)

    const fromStat = await statOrNull(matcher.from)
    if (fromStat == null) {
      log.debug({directory: matcher.from, reason: "doesn't exist"}, `skipped copying`)
      continue
    }

    const files = await walk(matcher.from, fileWalker.filter, fileWalker)
    const metadata = fileWalker.metadata

    fileSets.push(validateFileSet({src: matcher.from, files, metadata, transformedFiles: await transformFiles(transformer, files, metadata), destination: matcher.to}))
  }

  if (isElectronCompile) {
    // cache files should be first (better IO)
    fileSets.unshift(await compileUsingElectronCompile(fileSets[0], packager))
  }
  return fileSets
}

/** @internal */
function getNodeModuleExcludedExts(platformPackager: PlatformPackager<any>) {
  // do not exclude *.h files (https://github.com/electron-userland/electron-builder/issues/2852)
  const result = [".o", ".obj"].concat(excludedExts.split(",").map(it => `.${it}`))
  if (platformPackager.config.includePdb !== true) {
    result.push(".pdb")
  }
  if (platformPackager.platform !== Platform.WINDOWS) {
    // https://github.com/electron-userland/electron-builder/issues/1738
    result.push(".dll")
    result.push(".exe")
  }
  return result
}

function validateFileSet(fileSet: ResolvedFileSet): ResolvedFileSet {
  if (fileSet.src == null || fileSet.src.length === 0) {
    throw new Error("fileset src is empty")
  }
  return fileSet
}

/** @internal */
export async function copyNodeModules(platformPackager: PlatformPackager<any>, mainMatcher: FileMatcher, transformer: FileTransformer): Promise<Array<ResolvedFileSet>> {
  // const productionDeps = await platformPackager.info.productionDeps.value

  const rawJson = await executeAppBuilder(["node-dep-tree", "--dir", platformPackager.info.appDir])
  let data: any
  try {
    data = JSON.parse(rawJson)
  }
  catch (e) {
    throw new Error(`cannot parse: ${rawJson}\n error: ${e.stack}`)
  }

  const deps = data as Array<any>
  const nodeModuleExcludedExts = getNodeModuleExcludedExts(platformPackager)
  // mapSeries instead of map because copyNodeModules is concurrent and so, no need to increase queue/pressure
  return await BluebirdPromise.mapSeries(deps, async info => {
    const source = info.dir
    // use main matcher patterns, so, user can exclude some files in such hoisted node modules
    // source here includes node_modules, but pattern base should be without because users expect that pattern "!node_modules/loot-core/src{,/**/*}" will work
    const matcher = new FileMatcher(path.dirname(source), mainMatcher.to + path.sep + "node_modules", mainMatcher.macroExpander, mainMatcher.patterns)
    const copier = new NodeModuleCopyHelper(matcher, platformPackager.info)
    const names = info.deps
    const files = await copier.collectNodeModules(source, names, nodeModuleExcludedExts)
    return validateFileSet({src: source, destination: matcher.to, files, transformedFiles: await transformFiles(transformer, files, copier.metadata), metadata: copier.metadata})
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
