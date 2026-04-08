import { AsarDirectory, AsarStreamType, createPackageFromStreams } from "@electron/asar"
import { exists, Filter, FilterStats, isEmptyOrSpaces, log } from "builder-util"
import * as fs from "fs-extra"
import { readlink } from "fs-extra"
import * as os from "os"
import * as path from "path"
import { Readable } from "stream"
import { AsarOptions } from "../options/PlatformSpecificBuildOptions.js"
import { PlatformPackager } from "../platformPackager.js"
import { getDestinationPath, ResolvedFileSet } from "../util/appFileCopier.js"
import { detectUnpackedDirs } from "./unpackDetector.js"

const resolvePath = async (file: string | undefined): Promise<string | undefined> => (file && (await exists(file)) ? fs.realpath(file).catch(() => path.resolve(file)) : undefined)
const resolvePaths = async (filepaths: (string | undefined)[]) => {
  return Promise.all(filepaths.map(resolvePath)).then(paths => paths.filter((it): it is string => it != null))
}

const DENYLIST = resolvePaths([
  "/usr",
  "/lib",
  "/bin",
  "/sbin",
  "/etc",

  "/tmp",
  "/var", // block whole /var by default. If $HOME is under /var, it's explicitly in ALLOWLIST - https://github.com/electron-userland/electron-builder/issues/9025#issuecomment-3575380041

  // macOS system directories
  "/System",
  "/Library",
  "/private",

  // Windows system directories
  process.env.SystemRoot,
  process.env.WINDIR,
])

const ALLOWLIST = resolvePaths([
  os.tmpdir(), // always allow temp dir
  os.homedir(), // always allow home dir
])

/** @internal */
export class AsarPackager {
  private readonly outFile: string

  constructor(
    readonly packager: PlatformPackager<any>,
    private readonly config: {
      defaultDestination: string
      resourcePath: string
      options: AsarOptions
      unpackPattern: Filter | undefined
    }
  ) {
    this.outFile = path.join(config.resourcePath, `app.asar`)
  }

  async pack(fileSets: Array<ResolvedFileSet>) {
    const orderedFileSets = [
      // Write dependencies first to minimize offset changes to asar header
      ...fileSets.slice(1),

      // Finish with the app files that change most often
      fileSets[0],
    ].map(set => this.orderFileSet(set))

    const streams = await this.processFileSets(orderedFileSets)
    await this.executeElectronAsar(streams)
  }

  private async executeElectronAsar(streams: AsarStreamType[]) {
    // override logger temporarily to clean up console (electron/asar does some internal logging that blogs up the default electron-builder logs)
    const consoleLogger = console.log
    console.log = (...args) => {
      if (args[0] === "Ordering file has 100% coverage.") {
        return // no need to log, this means our ordering logic is working correctly
      }
      log.info({ args }, "logging @electron/asar")
    }
    await createPackageFromStreams(this.outFile, streams)
    console.log = consoleLogger
  }

  private async processFileSets(fileSets: ResolvedFileSet[]): Promise<AsarStreamType[]> {
    const unpackedPaths = new Set<string>()
    if (this.config.options.smartUnpack !== false) {
      for (const fileSet of fileSets) {
        detectUnpackedDirs(fileSet, unpackedPaths)
      }
    }

    const resultsMap = new Map<string, AsarStreamType>()
    const streamOrdering: string[] = []
    const normalizedUnpackedPaths = Array.from(unpackedPaths).map(p => path.normalize(p))

    // Check whether a file or directory should be unpacked, using pre-normalized unpacked paths and early returns
    const isUnpacked = (dir: string, file?: string, stat?: FilterStats): boolean => {
      const normalizedDir = path.normalize(dir)

      // Check file pattern first (most specific)
      if (!isEmptyOrSpaces(file) && stat && this.config.unpackPattern?.(file, stat)) {
        return true
      }

      // Check if path is within any unpacked directory
      for (const unpackedPath of normalizedUnpackedPaths) {
        if (normalizedDir === unpackedPath || normalizedDir.startsWith(unpackedPath + path.sep)) {
          return true
        }
      }

      return false
    }

    // First pass: process all files in order, ensuring parent directories exist
    for (const fileSet of fileSets) {
      // Don't use Promise.all, we need to retain order of execution/iteration through the already-ordered fileset
      for (const [index, file] of fileSet.files.entries()) {
        const transformedData = fileSet.transformedFiles?.get(index)
        const stat = fileSet.metadata.get(file)!
        const destination = path.relative(this.config.defaultDestination, getDestinationPath(file, fileSet))

        // Ensure parent directories exist before processing file
        this.ensureParentDirectories(destination, resultsMap, streamOrdering)

        const result = await this.processFileOrSymlink({
          file,
          destination,
          fileSet,
          transformedData,
          stat,
          isUnpacked,
        })

        if (result && !resultsMap.has(result.path)) {
          resultsMap.set(result.path, result)
          streamOrdering.push(result.path)
        }
      }
    }

    // Second pass: propagate unpacked flag to parent directories
    for (const entry of resultsMap.values()) {
      if (entry.unpacked) {
        this.markParentDirectoriesAsUnpacked(entry.path, resultsMap, isUnpacked)
      }
    }

    // Build final results array maintaining processing order
    return streamOrdering.reduce<AsarStreamType[]>((streams, path) => {
      const stream = resultsMap.has(path) ? resultsMap.get(path) : null
      if (stream != null) {
        streams.push(stream)
      }
      return streams
    }, [])
  }

  private ensureParentDirectories(destination: string, resultsMap: Map<string, AsarStreamType>, streamOrdering: string[]): void {
    const parents: string[] = []
    let current = path.dirname(path.normalize(destination))

    // Collect all parent directories from deepest to root
    while (current !== ".") {
      parents.unshift(current)
      current = path.dirname(current)
    }

    // Add parent directories in order (root to deepest)
    for (const parentPath of parents) {
      if (!resultsMap.has(parentPath)) {
        const dir: AsarDirectory = {
          type: "directory",
          path: parentPath,
          unpacked: false, // Updated in second pass if needed
        }
        resultsMap.set(parentPath, dir)
        streamOrdering.push(parentPath)
      }
    }
  }

  private markParentDirectoriesAsUnpacked(destination: string, resultsMap: Map<string, AsarStreamType>, isUnpacked: (path: string) => boolean): void {
    let current = path.dirname(path.normalize(destination))

    while (current !== ".") {
      const entry = resultsMap.get(current)
      if (entry && isUnpacked(current)) {
        entry.unpacked = true
      }
      current = path.dirname(current)
    }
  }

  private async processFileOrSymlink(options: {
    file: string
    destination: string
    stat: fs.Stats
    fileSet: ResolvedFileSet
    transformedData: string | Buffer | undefined
    isUnpacked: (dir: string, file?: string, stat?: FilterStats) => boolean
  }): Promise<AsarStreamType> {
    const { isUnpacked, transformedData, file, destination, stat } = options
    const unpacked = isUnpacked(destination, file, stat)

    // Handle directories
    if (!stat.isFile() && !stat.isSymbolicLink()) {
      return { path: destination, unpacked, type: "directory" }
    }

    // Handle transformed data (pre-processed content)
    if (transformedData != null) {
      const size = Buffer.byteLength(transformedData)
      return {
        path: destination,
        streamGenerator: () =>
          new Readable({
            read() {
              this.push(transformedData)
              this.push(null)
            },
          }),
        unpacked,
        type: "file",
        stat: { mode: stat.mode, size },
      }
    }

    // verify that the file is not a direct link or symlinked to access/copy a system file
    await this.protectSystemAndUnsafePaths(file, await this.packager.info.getWorkspaceRoot())

    const baseConfig = {
      path: destination,
      streamGenerator: () => fs.createReadStream(file),
      unpacked,
      stat,
    }

    // Handle regular files
    if (!stat.isSymbolicLink()) {
      return { ...baseConfig, type: "file" }
    }

    // Handle symlinks - make relative to source location
    let link = await readlink(file)
    if (path.isAbsolute(link)) {
      link = path.relative(path.dirname(file), link)
    }

    return {
      ...baseConfig,
      type: "link",
      symlink: link,
    }
  }

  private orderFileSet(fileSet: ResolvedFileSet): ResolvedFileSet {
    const sortedFileEntries = Array.from(fileSet.files.entries())

    sortedFileEntries.sort(([, a], [, b]) => {
      if (a === b) {
        return 0
      }

      // Place addons last because their signature changes per build
      const isAAddon = a.endsWith(".node")
      const isBAddon = b.endsWith(".node")
      if (isAAddon && !isBAddon) {
        return 1
      }
      if (isBAddon && !isAAddon) {
        return -1
      }

      // Otherwise order by name
      return a < b ? -1 : 1
    })

    let transformedFiles: Map<number, string | Buffer> | undefined
    if (fileSet.transformedFiles) {
      transformedFiles = new Map()

      const indexMap = new Map<number, number>()
      for (const [newIndex, [oldIndex]] of sortedFileEntries.entries()) {
        indexMap.set(oldIndex, newIndex)
      }

      for (const [oldIndex, value] of fileSet.transformedFiles) {
        const newIndex = indexMap.get(oldIndex)
        if (newIndex === undefined) {
          throw new Error(`Internal error: ${fileSet.files[oldIndex]} was lost while ordering asar`)
        }
        transformedFiles.set(newIndex, value)
      }
    }

    return {
      src: fileSet.src,
      destination: fileSet.destination,
      metadata: fileSet.metadata,
      files: sortedFileEntries.map(([, file]) => file),
      transformedFiles,
    }
  }

  private async checkAgainstRoots(target: string, allowRoots: string[]): Promise<boolean> {
    const resolved = await resolvePath(target)
    if (resolved == null || isEmptyOrSpaces(resolved)) {
      return false
    }

    for (const root of allowRoots) {
      if (resolved === root || resolved.startsWith(root + path.sep)) {
        return true
      }
    }
    return false
  }

  private async protectSystemAndUnsafePaths(file: string, workspaceRoot: string): Promise<void> {
    const resolved = await resolvePath(file)
    const logFields = { source: file, realPath: resolved }

    const workspace = await resolvePath(workspaceRoot)

    // If in workspace, always safe
    if (workspace && resolved?.startsWith(workspace)) {
      return
    }

    // Check allowlist (priority)
    if (await this.checkAgainstRoots(file, await ALLOWLIST)) {
      return
    }

    // Check denylist
    if (await this.checkAgainstRoots(file, await DENYLIST)) {
      log.error(logFields, `denied access to system or unsafe path`)
      throw new Error(`Cannot copy file [${file}] symlinked to file [${resolved}] outside the package to a system or unsafe path`)
    }

    // Default: outside explicit paths but not explicitly denied
    log.debug(logFields, `path is outside of explicit safe paths, defaulting to safe`)
  }
}
