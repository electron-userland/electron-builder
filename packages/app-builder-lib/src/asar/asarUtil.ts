import type { AsarStreamType, AsarDirectory } from "@electron/asar"
import { Filter, FilterStats, InvalidConfigurationError, isEmptyOrSpaces, log } from "builder-util"
import { dynamicImport } from "../util/dynamicImport.js"
import fs from "fs-extra"

import * as path from "path"
import { AsarOptions } from "../options/PlatformSpecificBuildOptions.js"
import { PlatformPackager } from "../platformPackager.js"
import { ResolvedFileSet, getDestinationPath } from "../util/appFileCopier.js"
import { detectUnpackedDirs } from "./unpackDetector.js"
import { alignAsarContent } from "./asarAlign.js"
import { assertSourceFileInTrustedRoots, getTrustedSourceRoots } from "../util/trustedSourceRoots.js"
import { Readable } from "stream"
const { readlink } = fs

/** @internal */
export function isPathInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + path.sep)
}

/**
 * Applies an asar ordering file (`asar.ordering`) to the stream list `@electron/asar` packs: directory entries move to
 * the front in their original relative order (they hold no data), the listed files follow in the order of the file,
 * then everything else in its original order. Lines use the same syntax `@electron/asar` accepts — a path relative to
 * the app root, optionally prefixed with `/` or with a `<anything>:` prefix (e.g. a load counter) — blank lines are
 * ignored and `\` separators are accepted. Lines naming a directory are ignored; files listed but not present are
 * counted in `listed`, reported in `missing` and skipped.
 */
export function orderAsarStreams(
  streams: Array<AsarStreamType>,
  orderingLines: Array<string>
): { streams: Array<AsarStreamType>; listed: number; matched: number; missing: Array<string> } {
  const rank = new Map<string, number>()
  for (const rawLine of orderingLines) {
    // ordering files written on Windows use `\` — convert it so they match on macOS and Linux too
    let line = rawLine
      .slice(rawLine.lastIndexOf(":") + 1)
      .trim()
      .replace(/\\/g, "/")
    if (line.length === 0) {
      continue
    }
    if (line.startsWith("/")) {
      line = line.slice(1)
    }
    // `path.normalize` keeps a trailing separator ("src/") that directory stream paths lack; a bare "/" is left alone
    const key = path.normalize(line).replace(/(?<=.)[/\\]+$/, "")
    if (!rank.has(key)) {
      rank.set(key, rank.size)
    }
  }
  if (rank.size === 0) {
    return { streams, listed: 0, matched: 0, missing: [] }
  }
  const directories: Array<AsarStreamType> = []
  const listed: Array<{ stream: AsarStreamType; rank: number }> = []
  const rest: Array<AsarStreamType> = []
  // entries are removed from `rank` as they are consumed, so what is left at the end is missing from the archive
  for (const stream of streams) {
    const key = path.normalize(stream.path)
    if (stream.type === "directory") {
      directories.push(stream)
      // a line naming a directory orders nothing (directories hold no data), so it is neither listed nor missing
      rank.delete(key)
      continue
    }
    const position = rank.get(key)
    if (position == null) {
      rest.push(stream)
    } else {
      rank.delete(key)
      listed.push({ stream, rank: position })
    }
  }
  listed.sort((a, b) => a.rank - b.rank)
  const missing = [...rank.keys()]
  return { streams: [...directories, ...listed.map(it => it.stream), ...rest], listed: listed.length + missing.length, matched: listed.length, missing }
}

type AsarOrderingPackager = Pick<PlatformPackager<any>, "getResource" | "buildResourcesDir" | "projectDir">

const ASAR_ORDERING_MIGRATION_URL = "https://www.electron.build/docs/migration/v27-build-changes#asar-ordering-is-now-applied"

/**
 * Resolves `asar.ordering` like other build resources (build resources directory first, then the project directory),
 * applies it to `streams` and announces the v27 behaviour change once per process.
 * @internal
 */
export async function applyAsarOrdering(packager: AsarOrderingPackager, ordering: string, streams: Array<AsarStreamType>): Promise<Array<AsarStreamType>> {
  const orderingFile = await resolveAsarOrderingFile(packager, ordering)
  const { streams: ordered, listed, matched, missing } = orderAsarStreams(streams, (await fs.readFile(orderingFile, "utf8")).split(/\r?\n/))
  const orderingPath = log.filePath(orderingFile)
  log
    .once("asar-ordering-applied")
    .warn(
      { ordering: orderingPath },
      "asar.ordering is now applied to app.asar (electron-builder v26 and earlier silently ignored it): the listed files are packed first, " +
        "ahead of the default dependencies-first layout, which can increase differential update download size. " +
        `Remove the option to keep the default layout. See ${ASAR_ORDERING_MIGRATION_URL}`
    )
  log.once("asar-ordering", packager).info({ ordering: orderingPath, matched: `${matched}/${listed}` }, "applied asar ordering")
  if (missing.length > 0) {
    log.debug({ ordering: orderingPath, missing: missing.length, first: missing.slice(0, 5).join(", ") }, "asar ordering lists files that are not in the archive")
  }
  return ordered
}

async function resolveAsarOrderingFile(packager: AsarOrderingPackager, ordering: string): Promise<string> {
  try {
    return (await packager.getResource(ordering))!
  } catch (e: any) {
    if (!(e instanceof InvalidConfigurationError)) {
      throw e
    }
    const candidates = [...new Set([path.resolve(packager.buildResourcesDir, ordering), path.resolve(packager.projectDir, ordering)])]
    throw new InvalidConfigurationError(
      `asar.ordering file "${ordering}" was not found at ${candidates.join(" or ")} ` +
        "(the path resolves relative to the build resources directory, then the project directory). " +
        "electron-builder v27 applies the ordering file to app.asar (v26 and earlier ignored the option), so it must exist; fix the path or remove the option to keep the default layout. " +
        `See ${ASAR_ORDERING_MIGRATION_URL}`
    )
  }
}

/** @internal */
export async function withElectronAsarLogging<T>(task: () => Promise<T>): Promise<T> {
  // override logger temporarily to clean up console (electron/asar does some internal logging that blogs up the default electron-builder logs)
  const consoleLogger = console.log
  console.log = (...args) => {
    if (args[0] === "Ordering file has 100% coverage.") {
      return // no need to log, this means our ordering logic is working correctly
    }
    log.info({ args }, "logging @electron/asar")
  }
  try {
    return await task()
  } finally {
    console.log = consoleLogger
  }
}

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

    let streams = await this.processFileSets(orderedFileSets)
    const ordering = this.config.options.ordering
    if (!isEmptyOrSpaces(ordering)) {
      streams = await applyAsarOrdering(this.packager, ordering, streams)
    }
    await this.executeElectronAsar(streams)

    const contentAlignment = this.config.options.contentAlignment
    if (contentAlignment != null && contentAlignment !== 0) {
      await alignAsarContent(this.outFile, contentAlignment)
    }
  }

  private async executeElectronAsar(streams: AsarStreamType[]) {
    await withElectronAsarLogging(async () => {
      const { createPackageFromStreams } = await dynamicImport<typeof import("@electron/asar")>("@electron/asar")
      await createPackageFromStreams(this.outFile, streams)
    })
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

    // verify that the file is not a direct link or symlinked to a file outside the workspace and the package-manager store,
    // before any content is used: the transformer (e.g. for a node_modules package.json) reads the file through its symlinks too
    await assertSourceFileInTrustedRoots(file, await getTrustedSourceRoots(this.packager), await this.packager.getExternalLinkPolicy())

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
}
