import { AsyncTaskManager, FileCopier, FileTransformer, Link, log, MAX_FILE_REQUESTS, statOrNull, walk } from "builder-util"
import { Stats } from "fs"
import { ensureSymlink } from "fs-extra"
import { mkdir, readlink } from "fs/promises"
import * as path from "path"
import asyncPool from "tiny-async-pool"
import { isLibOrExe } from "../asar/unpackDetector"
import { Platform } from "../core"
import { excludedExts, FileMatcher } from "../fileMatcher"
import { createElectronCompilerHost, NODE_MODULES_PATTERN } from "../fileTransformer"
import { Packager } from "../packager"
import { PlatformPackager } from "../platformPackager"
import { AppFileWalker } from "./AppFileWalker"
import { NodeModuleCopyHelper } from "./NodeModuleCopyHelper"
import { NodeModuleInfo } from "./packageDependencies"
import { getNodeModules } from "../node-module-collector"

const BOWER_COMPONENTS_PATTERN = `${path.sep}bower_components${path.sep}`
/** @internal */
export const ELECTRON_COMPILE_SHIM_FILENAME = "__shim.js"

export function getDestinationPath(file: string, fileSet: ResolvedFileSet) {
  if (file === fileSet.src) {
    return fileSet.destination
  }

  const src = fileSet.src
  const dest = fileSet.destination
  // get node_modules path relative to src and then append to dest
  if (file.startsWith(src)) {
    return path.join(dest, path.relative(src, file))
  }
  return dest
}

export async function copyAppFiles(fileSet: ResolvedFileSet, packager: Packager, transformer: FileTransformer) {
  const metadata = fileSet.metadata
  // search auto unpacked dir
  const taskManager = new AsyncTaskManager(packager.cancellationToken)
  const createdParentDirs = new Set<string>()

  const fileCopier = new FileCopier(file => {
    return !isLibOrExe(file)
  }, transformer)
  const links: Array<Link> = []
  for (let i = 0, n = fileSet.files.length; i < n; i++) {
    const sourceFile = fileSet.files[i]
    const stat = metadata.get(sourceFile)
    if (stat == null) {
      // dir
      continue
    }

    const destinationFile = getDestinationPath(sourceFile, fileSet)
    if (stat.isSymbolicLink()) {
      links.push({ file: destinationFile, link: await readlink(sourceFile) })
      continue
    }

    const fileParent = path.dirname(destinationFile)
    if (!createdParentDirs.has(fileParent)) {
      createdParentDirs.add(fileParent)
      await mkdir(fileParent, { recursive: true })
    }

    taskManager.addTask(fileCopier.copy(sourceFile, destinationFile, stat))
    if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
      await taskManager.awaitTasks()
    }
  }

  if (taskManager.tasks.length > 0) {
    await taskManager.awaitTasks()
  }

  await asyncPool(MAX_FILE_REQUESTS, links, it => ensureSymlink(it.link, it.file))
}

// os path separator is used
export interface ResolvedFileSet {
  src: string
  destination: string

  files: Array<string>
  metadata: Map<string, Stats>
  transformedFiles?: Map<number, string | Buffer> | null
}

// used only for ASAR, if no asar, file transformed on the fly
export async function transformFiles(transformer: FileTransformer, fileSet: ResolvedFileSet): Promise<void> {
  if (transformer == null) {
    return
  }

  let transformedFiles = fileSet.transformedFiles
  if (fileSet.transformedFiles == null) {
    transformedFiles = new Map()
    fileSet.transformedFiles = transformedFiles
  }

  const metadata = fileSet.metadata
  const filesPromise = fileSet.files.map(async (it, index) => {
    const fileStat = metadata.get(it)
    if (fileStat == null || !fileStat.isFile()) {
      return
    }

    const transformedValue = transformer(it)
    if (transformedValue == null) {
      return
    }

    if (typeof transformedValue === "object" && "then" in transformedValue) {
      return (transformedValue as Promise<any>).then(it => {
        if (it != null) {
          transformedFiles!.set(index, it)
        }
        return
      })
    }
    transformedFiles!.set(index, transformedValue as string | Buffer)
    return
  })
  // `asyncPool` doesn't provide `index` in it's handler, so we `map` first before using it
  await asyncPool(MAX_FILE_REQUESTS, filesPromise, promise => promise)
}

export async function computeFileSets(
  matchers: Array<FileMatcher>,
  transformer: FileTransformer | null,
  platformPackager: PlatformPackager<any>,
  isElectronCompile: boolean
): Promise<Array<ResolvedFileSet>> {
  const fileSets: Array<ResolvedFileSet> = []
  const packager = platformPackager.info

  for (const matcher of matchers) {
    const fileWalker = new AppFileWalker(matcher, packager)

    const fromStat = await statOrNull(matcher.from)
    if (fromStat == null) {
      log.debug({ directory: matcher.from, reason: "doesn't exist" }, `skipped copying`)
      continue
    }

    const files = await walk(matcher.from, fileWalker.filter, fileWalker)
    const metadata = fileWalker.metadata
    fileSets.push(validateFileSet({ src: matcher.from, files, metadata, destination: matcher.to }))
  }

  if (isElectronCompile) {
    // cache files should be first (better IO)
    fileSets.unshift(await compileUsingElectronCompile(fileSets[0], packager))
  }
  return fileSets
}

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
export async function computeNodeModuleFileSets(platformPackager: PlatformPackager<any>, mainMatcher: FileMatcher): Promise<Array<ResolvedFileSet>> {
  const deps = await getNodeModules(platformPackager.info.appDir)
  log.debug({ nodeModules: deps }, "collected node modules")

  const nodeModuleExcludedExts = getNodeModuleExcludedExts(platformPackager)
  // serial execution because copyNodeModules is concurrent and so, no need to increase queue/pressure
  const result = new Array<ResolvedFileSet>()
  let index = 0
  const NODE_MODULES = "node_modules"

  const collectNodeModules = async (dep: NodeModuleInfo, destination: string) => {
    const source = dep.dir
    const matcher = new FileMatcher(source, destination, mainMatcher.macroExpander, mainMatcher.patterns)
    const copier = new NodeModuleCopyHelper(matcher, platformPackager.info)
    const files = await copier.collectNodeModules(dep, nodeModuleExcludedExts, path.relative(mainMatcher.to, destination))
    result[index++] = validateFileSet({ src: source, destination, files, metadata: copier.metadata })

    if (dep.dependencies) {
      for (const c of dep.dependencies) {
        await collectNodeModules(c, path.join(destination, NODE_MODULES, c.name))
      }
    }
  }

  for (const dep of deps) {
    const destination = path.join(mainMatcher.to, NODE_MODULES, dep.name)
    await collectNodeModules(dep, destination)
  }

  return result
}

async function compileUsingElectronCompile(mainFileSet: ResolvedFileSet, packager: Packager): Promise<ResolvedFileSet> {
  log.info("compiling using electron-compile")

  const electronCompileCache = await packager.tempDirManager.getTempDir({ prefix: "electron-compile-cache" })
  const cacheDir = path.join(electronCompileCache, ".cache")
  // clear and create cache dir
  await mkdir(cacheDir, { recursive: true })
  const compilerHost = await createElectronCompilerHost(mainFileSet.src, cacheDir)
  const nextSlashIndex = mainFileSet.src.length + 1
  // pre-compute electron-compile to cache dir - we need to process only subdirectories, not direct files of app dir
  const filesPromise: Promise<any>[] = mainFileSet.files.map(file => {
    if (
      file.includes(NODE_MODULES_PATTERN) ||
      file.includes(BOWER_COMPONENTS_PATTERN) ||
      !file.includes(path.sep, nextSlashIndex) || // ignore not root files
      !mainFileSet.metadata.get(file)!.isFile()
    ) {
      return
    }
    return compilerHost.compile(file)
  })
  await asyncPool(MAX_FILE_REQUESTS, filesPromise, promise => promise)
  await compilerHost.saveConfiguration()

  const metadata = new Map<string, Stats>()
  const cacheFiles = await walk(cacheDir, file => !file.startsWith("."), {
    consume: (file, fileStat) => {
      if (fileStat.isFile()) {
        metadata.set(file, fileStat)
      }
      return null
    },
  })

  // add shim
  const shimPath = `${mainFileSet.src}${path.sep}${ELECTRON_COMPILE_SHIM_FILENAME}`
  mainFileSet.files.push(shimPath)
  mainFileSet.metadata.set(shimPath, { isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false } as any)
  if (mainFileSet.transformedFiles == null) {
    mainFileSet.transformedFiles = new Map()
  }
  mainFileSet.transformedFiles.set(
    mainFileSet.files.length - 1,
    `
'use strict';
require('electron-compile').init(__dirname, require('path').resolve(__dirname, '${packager.metadata.main || "index"}'), true);
`
  )
  return { src: electronCompileCache, files: cacheFiles, metadata, destination: mainFileSet.destination }
}
