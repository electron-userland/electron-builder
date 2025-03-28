import { createPackageFromStreams, Filestream } from "@electron/asar"
import { log } from "builder-util"
import { Filter } from "builder-util/out/fs"
import * as fs from "fs-extra"
import { readlink } from "fs-extra"
import * as path from "path"
import { AsarOptions } from "../options/PlatformSpecificBuildOptions"
import { PlatformPackager } from "../platformPackager"
import { ResolvedFileSet, getDestinationPath } from "../util/appFileCopier"
import { detectUnpackedDirs } from "./unpackDetector"
import { Readable } from "stream"

/** @internal */
export class AsarPackager {
  private readonly outFile: string

  constructor(
    private readonly packager: PlatformPackager<any>,
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

  private async executeElectronAsar(streams: Filestream[]) {
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

  private async processFileSets(fileSets: ResolvedFileSet[]): Promise<Filestream[]> {
    const unpackedPaths = new Set<string>()

    const results: Filestream[] = []
    for (const fileSet of fileSets) {
      if (this.config.options.smartUnpack !== false) {
        detectUnpackedDirs(fileSet, unpackedPaths)
      }

      // Don't use Promise.all, we need to retain order of execution/iteration through the already-ordered fileset
      for (const [index, file] of fileSet.files.entries()) {
        const transformedData = fileSet.transformedFiles?.get(index)
        const stat = fileSet.metadata.get(file)!
        const destination = path.relative(this.config.defaultDestination, getDestinationPath(file, fileSet))

        const result = await this.processFileOrSymlink({ unpackedPaths, transformedData, file, destination, stat, fileSet })
        if (result != null) {
          results.push(result)
        }
      }
    }
    return results
  }

  private async processFileOrSymlink(options: {
    file: string
    destination: string
    stat: fs.Stats
    fileSet: ResolvedFileSet
    transformedData: string | Buffer | undefined
    unpackedPaths: Set<string>
  }): Promise<Filestream | null> {
    const { unpackedPaths, transformedData, file, destination, stat, fileSet } = options
    const unpacked = unpackedPaths.has(file) || (this.config.unpackPattern?.(file, stat) ?? false)

    if (!stat.isFile() && !stat.isSymbolicLink()) {
      return null
    }

    // write any data if provided, skip symlink check
    if (transformedData != null) {
      const streamGenerator = () => {
        return new Readable({
          read() {
            this.push(transformedData)
            this.push(null)
          },
        })
      }
      return { filePath: destination, streamGenerator, properties: { unpacked, type: "file", stat } }
    }

    const realPathFile = await fs.realpath(file)
    const realPathRelative = path.relative(fileSet.src, realPathFile)
    const isOutsidePackage = realPathRelative.startsWith("..")
    if (isOutsidePackage) {
      log.error({ source: log.filePath(file), realPathFile: log.filePath(realPathFile) }, `unable to copy, file is symlinked outside the package`)
      throw new Error(`Cannot copy file (${path.basename(file)}) symlinked to file (${path.basename(realPathFile)}) outside the package as that violates asar security integrity`)
    }

    // not a symlink, copy directly
    if (file === realPathFile) {
      return { filePath: destination, streamGenerator: () => fs.createReadStream(file), properties: { unpacked, type: "file", stat } }
    }

    // okay, it must be a symlink. evaluate link to be relative to source file in asar
    let link = await readlink(file)
    if (path.isAbsolute(link)) {
      link = path.relative(path.dirname(file), link)
    }
    return { filePath: destination, streamGenerator: () => fs.createReadStream(file), properties: { unpacked, type: "link", stat, symlink: link } }
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
          const file = fileSet.files[oldIndex]
          throw new Error(`Internal error: ${file} was lost while ordering asar`)
        }

        transformedFiles.set(newIndex, value)
      }
    }

    const { src, destination, metadata } = fileSet

    return {
      src,
      destination,
      metadata,
      files: sortedFileEntries.map(([, file]) => file),
      transformedFiles,
    }
  }
}
