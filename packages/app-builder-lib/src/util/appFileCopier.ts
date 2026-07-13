import { Arch, AsyncTaskManager, FileCopier, FileTransformer, isEmptyOrSpaces, Link, log, MAX_FILE_REQUESTS, statOrNull, walk } from "builder-util"
import { Stats } from "fs"
import fsExtra from "fs-extra"
import { mkdir, readlink } from "fs/promises"
import * as path from "path"
import asyncPool from "tiny-async-pool"
import { isLibOrExe } from "../asar/unpackDetector.js"
import { Platform } from "../core.js"
import { DEFAULT_EXCLUDED_EXTENSIONS, FileMatcher } from "../fileMatcher.js"
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

/**
 * Production dependencies that are excluded from the copied `node_modules` by default. These are
 * still legitimate production dependencies (for SBOM, license, and vulnerability tracking), but
 * electron-builder already provides them another way — notably the Electron runtime, which is
 * embedded separately — so copying them into the app would just duplicate what is already there.
 * Users can override the set via `config.ignoredProductionDependencies`.
 */
export const DEFAULT_IGNORED_PRODUCTION_DEPENDENCIES: ReadonlyArray<string> = ["electron", "electron-builder"]

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
  const result = DEFAULT_EXCLUDED_EXTENSIONS.map(it => `.${it}`)
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
    // Ignore excluded dependencies.
    if (dep.excluded) {
      return
    }

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

type CollectedNodeModules = { nodeModules: NodeModuleInfo[]; logSummary: ModuleManager["logSummary"] }

/** Runs a single package-manager collector against a single directory. */
type CollectorRunner = (pm: PM, dir: string) => Promise<CollectedNodeModules>

// `workspace:`/`file:`/`link:`/`portal:` dependencies are symlinked into place rather than
// installed as standalone, hoistable packages, so they may legitimately be absent from a
// collected tree and cannot be used to validate it.
const LOCAL_DEPENDENCY_SPEC = /^(?:workspace|file|link|portal):/

/**
 * Determines whether a collected module tree actually describes the package being built.
 *
 * A package-manager `list` invocation can resolve to the wrong project root — most notably when
 * electron-builder is run from a workspace sub-package whose dependencies are hoisted to the
 * workspace root. In that case the collector returns a non-empty but unrelated tree. Accepting it
 * would suppress the manual-traversal fallback that resolves the correct modules, so we need to
 * tell a matching collection from a mismatched one.
 *
 * A collection matches when at least one of the package's declared external (registry-installed,
 * non-`workspace:`/`file:`/`link:`/`portal:`) production dependencies is present at the top level —
 * those direct dependencies are always hoisted to the top level of a correct collection. When the
 * package declares no external production dependencies there is nothing to validate against, so any
 * non-empty collection is accepted.
 */
export function collectionMatchesAppDependencies(nodeModules: NodeModuleInfo[], dependencies: Record<string, string> | undefined): boolean {
  const requiredExternalDeps = Object.entries(dependencies ?? {})
    .filter(([, spec]) => !LOCAL_DEPENDENCY_SPEC.test(spec))
    .map(([name]) => name)
  if (requiredExternalDeps.length === 0) {
    return true
  }
  const collected = new Set(nodeModules.map(it => it.name))
  return requiredExternalDeps.some(name => collected.has(name))
}

/**
 * Walks the candidate (package-manager, directory) combinations and returns the first collection
 * that both contains modules and matches the package being built (see
 * {@link collectionMatchesAppDependencies}). A non-empty collection that does NOT match — e.g. a
 * workspace-root tree returned for a sub-package — is retained only as a last-resort fallback so a
 * later approach (notably {@link PM.TRAVERSAL}) can supply the correct modules.
 */
export async function resolveFirstMatchingCollection(options: {
  pmApproaches: PM[]
  searchDirectories: string[]
  dependencies: Record<string, string> | undefined
  run: CollectorRunner
}): Promise<CollectedNodeModules | undefined> {
  const { pmApproaches, searchDirectories, dependencies, run } = options
  let fallback: CollectedNodeModules | undefined

  for (const pm of pmApproaches) {
    for (const dir of searchDirectories) {
      log.info({ pm, searchDir: dir }, "searching for node modules")
      const deps = await run(pm, dir)
      if (deps.nodeModules.length === 0) {
        log.info({ pm, searchDir: dir }, "no node modules found in collection, trying next search directory")
        continue
      }
      if (collectionMatchesAppDependencies(deps.nodeModules, dependencies)) {
        log.debug({ pm, searchDir: dir, depCount: deps.nodeModules.length }, "collected node modules")
        return deps
      }
      log.info({ pm, searchDir: dir }, "collected node modules do not match the target package, trying next search directory/approach")
      fallback ??= deps
    }
  }
  return fallback
}

/** @internal */
export async function collectNodeModulesWithLogging(platformPackager: PlatformPackager<any>, arch: Arch | null) {
  const { tempDirManager, appDir, projectDir } = platformPackager

  // Drop packages whose `package.json` `cpu`/`os` is incompatible with the target arch/platform while
  // collecting (e.g. exclude `@esbuild/darwin-arm64` from the x64 slice). See NodeModulesCollector.
  // `null` arch (universal slices) disables the filter so both slices stay symmetric for the merge.
  const archFilter = arch == null ? undefined : { cpu: archToNodeCpu(arch), os: platformPackager.platform.nodeName }

  const searchDirectories = Array.from(new Set([appDir, projectDir, await platformPackager.getWorkspaceRoot()])).filter((it): it is string => isEmptyOrSpaces(it) === false)
  const pmApproaches = [await platformPackager.getPackageManager(), PM.TRAVERSAL]

  // The default-ignored packages are excluded from the copied `node_modules` — together with any
  // transitive dependency they alone require — because electron-builder already provides them another
  // way (the Electron runtime is embedded separately), so copying them would be redundant. They remain
  // valid production dependencies for tooling such as SBOM generation. See NodeModulesCollector.getNodeModules.
  const configuredIgnored = platformPackager.config.ignoredProductionDependencies
  const ignoredDependencies = configuredIgnored == null ? DEFAULT_IGNORED_PRODUCTION_DEPENDENCIES : configuredIgnored

  // Validate against the as-declared (pre-extraMetadata) production dependencies so a configured
  // `extraMetadata.dependencies` entry that isn't installed cannot reject a correct collection.
  const deps = await resolveFirstMatchingCollection({
    pmApproaches,
    searchDirectories,
    dependencies: platformPackager.originalMetadata.dependencies,
    run: (pm, dir) => getCollectorByPackageManager(pm, dir, tempDirManager).getNodeModules({ packageName: platformPackager.nodePackageName, archFilter, ignoredDependencies }),
  })

  if (!deps?.nodeModules?.length) {
    log.warn({ searchDirectories: searchDirectories.map(it => log.filePath(it)) }, "no node modules returned while searching directories")
    return []
  }

  const summary = Object.entries(deps.logSummary ?? {}).filter(([, dependencies]) => Array.isArray(dependencies) && dependencies.length > 0)
  for (const [errorMessage, dependencies] of summary) {
    const logLevel = logMessageLevelByKey[errorMessage as LogMessageByKey] || "debug"
    log[logLevel]({ dependencies }, errorMessage)
  }

  // Tripwire: the default-ignored packages are excluded because electron-builder already provides them
  // (e.g. the embedded Electron runtime), so a copy in `node_modules` is redundant. They only reach this
  // point unflagged when a user has removed them from `ignoredProductionDependencies`; record any that
  // are therefore about to be copied (present but not marked `excluded`) so the summary below warns.
  const bundledDefaultIgnored = deps.nodeModules.filter(it => !it.excluded && DEFAULT_IGNORED_PRODUCTION_DEPENDENCIES.includes(it.name)).map(it => it.name)
  if (bundledDefaultIgnored.length > 0) {
    log.warn({ dependencies: bundledDefaultIgnored }, "copied dependencies that shouldn't be needed, see ignoredProductionDependencies")
  }

  return deps.nodeModules
}
