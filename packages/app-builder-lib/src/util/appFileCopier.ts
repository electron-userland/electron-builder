import { Arch, AsyncTaskManager, FileCopier, FileTransformer, isEmptyOrSpaces, Link, log, MAX_FILE_REQUESTS, statOrNull, walk } from "builder-util"
import { Stats } from "fs"
import fsExtra from "fs-extra"
import { mkdir, readlink } from "fs/promises"
import * as path from "path"
import asyncPool from "tiny-async-pool"
import { isLibOrExe } from "../asar/unpackDetector.js"
import { Platform } from "../core.js"
import { excludedExts, FileMatcher } from "../fileMatcher.js"
import { getCollectorByPackageManager, PM } from "../node-module-collector/index.js"
import { LogMessageByKey, logMessageLevelByKey, ModuleManager } from "../node-module-collector/moduleManager.js"
import { Packager } from "../packager.js"
import { PlatformPackager } from "../platformPackager.js"
import { AppFileWalker } from "./AppFileWalker.js"
import { NodeModuleCopyHelper } from "./NodeModuleCopyHelper.js"
import { NodeModuleInfo } from "../node-module-collector/types.js"
import { archToNodeCpu } from "./archCompatibility.js"

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

  await asyncPool(MAX_FILE_REQUESTS, links, it => fsExtra.ensureSymlink(it.link, it.file))
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

export async function computeFileSets(matchers: Array<FileMatcher>, transformer: FileTransformer | null, platformPackager: PlatformPackager<any>): Promise<Array<ResolvedFileSet>> {
  const fileSets: Array<ResolvedFileSet> = []

  for (const matcher of matchers) {
    const fileWalker = new AppFileWalker(matcher, platformPackager)

    const fromStat = await statOrNull(matcher.from)
    if (fromStat == null) {
      log.debug({ directory: matcher.from, reason: "doesn't exist" }, `skipped copying`)
      continue
    }

    const files = await walk(matcher.from, fileWalker.filter, fileWalker)
    const metadata = fileWalker.metadata
    fileSets.push(validateFileSet({ src: matcher.from, files, metadata, destination: matcher.to }))
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
export async function computeNodeModuleFileSets(
  platformPackager: PlatformPackager<any>,
  mainMatcher: FileMatcher,
  arch: Arch,
  applyArchFilter = true
): Promise<Array<ResolvedFileSet>> {
  const deps = await collectNodeModulesWithLogging(platformPackager, applyArchFilter ? arch : null)

  const nodeModuleExcludedExts = getNodeModuleExcludedExts(platformPackager)
  // serial execution because copyNodeModules is concurrent and so, no need to increase queue/pressure
  const result = new Array<ResolvedFileSet>()
  let index = 0
  const NODE_MODULES = "node_modules"

  const collectNodeModules = async (dep: NodeModuleInfo, destination: string) => {
    const source = dep.dir
    const matcher = new FileMatcher(source, destination, mainMatcher.macroExpander, mainMatcher.patterns)
    const copier = new NodeModuleCopyHelper(matcher, platformPackager)
    const files = await copier.collectNodeModules(dep, nodeModuleExcludedExts, path.relative(mainMatcher.to, destination))
    result[index++] = validateFileSet({ src: source, destination, files, metadata: copier.metadata })

    log.debug({ dep: dep.name, from: log.filePath(source), to: log.filePath(destination), filesCount: files.length }, "identified module")

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

async function collectNodeModulesWithLogging(platformPackager: PlatformPackager<any>, arch: Arch | null) {
  const { tempDirManager, appDir, projectDir } = platformPackager

  let deps: { nodeModules: NodeModuleInfo[]; logSummary: ModuleManager["logSummary"] } | undefined = undefined

  // Drop packages whose `package.json` `cpu`/`os` is incompatible with the target arch/platform while
  // collecting (e.g. exclude `@esbuild/darwin-arm64` from the x64 slice). See NodeModulesCollector.
  // `null` arch (universal slices) disables the filter so both slices stay symmetric for the merge.
  const archFilter = arch == null ? undefined : { cpu: archToNodeCpu(arch), os: platformPackager.platform.nodeName }

  const searchDirectories = Array.from(new Set([appDir, projectDir, await platformPackager.getWorkspaceRoot()])).filter((it): it is string => isEmptyOrSpaces(it) === false)
  const pmApproaches = [await platformPackager.getPackageManager(), PM.TRAVERSAL]
  for (const pm of pmApproaches) {
    for (const dir of searchDirectories) {
      log.info({ pm, searchDir: dir }, "searching for node modules")
      const collector = getCollectorByPackageManager(pm, dir, tempDirManager)
      deps = await collector.getNodeModules({ packageName: platformPackager.nodePackageName, archFilter })
      if (deps.nodeModules.length > 0) {
        break
      }
      const attempt = searchDirectories.indexOf(dir)
      if (attempt < searchDirectories.length - 1) {
        log.info({ searchDir: dir, attempt }, "no node modules found in collection, trying next search directory")
      }
    }
    if (deps?.nodeModules?.length) {
      log.debug({ pm, nodeModules: deps.nodeModules }, "collected node modules")
      break
    }
  }
  if (!deps?.nodeModules?.length) {
    log.warn({ searchDirectories: searchDirectories.map(it => log.filePath(it)) }, "no node modules returned while searching directories")
    return []
  }

  const summary = Object.entries(deps.logSummary ?? {}).filter(([, dependencies]) => Array.isArray(dependencies) && dependencies.length > 0)
  for (const [errorMessage, dependencies] of summary) {
    const logLevel = logMessageLevelByKey[errorMessage as LogMessageByKey] || "debug"
    log[logLevel]({ dependencies }, errorMessage)
  }

  return deps.nodeModules
}
