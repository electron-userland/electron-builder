import { createPackageFromStreams, AsarStreamType, AsarDirectory } from "@electron/asar"
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
import * as os from "os"

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

    const results: AsarStreamType[] = []
    const resultsPaths = new Set<string>()
    for (const fileSet of fileSets) {
      // Don't use Promise.all, we need to retain order of execution/iteration through the already-ordered fileset
      for (const [index, file] of fileSet.files.entries()) {
        const transformedData = fileSet.transformedFiles?.get(index)
        const stat = fileSet.metadata.get(file)!
        const destination = path.relative(this.config.defaultDestination, getDestinationPath(file, fileSet))

        const paths = Array.from(unpackedPaths).map(p => path.normalize(p))

        const isChildDirectory = (fileOrDirPath: string) =>
          paths.includes(path.normalize(fileOrDirPath)) || paths.some(unpackedPath => path.normalize(fileOrDirPath).startsWith(unpackedPath + path.sep))
        const isUnpacked = (dir: string) => {
          const isChild = isChildDirectory(dir)
          const isFileUnpacked = this.config.unpackPattern?.(file, stat) ?? false
          return isChild || isFileUnpacked
        }

        this.processParentDirectories(isUnpacked, destination, results, resultsPaths)

        const result = await this.processFileOrSymlink({
          file,
          destination,
          fileSet,
          transformedData,
          stat,
          isUnpacked,
        })
        if (result != null) {
          results.push(result)
          resultsPaths.add(result.path)
        }
      }
    }
    return results
  }

  private processParentDirectories(isUnpacked: (path: string) => boolean, destination: string, results: AsarStreamType[], resultsPaths: Set<string>) {
    // process parent directories
    let superDir = path.dirname(path.normalize(destination))
    while (superDir !== ".") {
      const dir: AsarDirectory = {
        type: "directory",
        path: superDir,
        unpacked: isUnpacked(superDir),
      }
      // add to results if not already present
      if (!resultsPaths.has(dir.path)) {
        results.push(dir)
        resultsPaths.add(dir.path)
      }

      superDir = path.dirname(superDir)
    }
  }

  private async processFileOrSymlink(options: {
    file: string
    destination: string
    stat: fs.Stats
    fileSet: ResolvedFileSet
    transformedData: string | Buffer | undefined
    isUnpacked: (path: string) => boolean
  }): Promise<AsarStreamType> {
    const { isUnpacked, transformedData, file, destination, stat } = options
    const unpacked = isUnpacked(destination)

    if (!stat.isFile() && !stat.isSymbolicLink()) {
      return { path: destination, unpacked, type: "directory" }
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
      const size = Buffer.byteLength(transformedData)
      return { path: destination, streamGenerator, unpacked, type: "file", stat: { mode: stat.mode, size } }
    }

    // verify that the file is not a direct link or symlinked to access/copy a system file
    await this.protectSystemAndUnsafePaths(file)

    const config = {
      path: destination,
      streamGenerator: () => fs.createReadStream(file),
      unpacked,
      stat,
    }

    // file, stream directly
    if (!stat.isSymbolicLink()) {
      return {
        ...config,
        type: "file",
      }
    }

    // guard against symlink pointing to outside workspace root
    await this.protectSystemAndUnsafePaths(file, await this.packager.info.getWorkspaceRoot())

    // okay, it must be a symlink. evaluate link to be relative to source file in asar
    let link = await readlink(file)
    if (path.isAbsolute(link)) {
      link = path.relative(path.dirname(file), link)
    }
    return {
      ...config,
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

  private async getProtectedPaths(): Promise<string[]> {
    const systemPaths = [
      // Generic *nix
      "/usr",
      "/lib",
      "/bin",
      "/sbin",
      "/System",
      "/Library",
      "/private/etc",
      "/private/var/db",
      "/private/var/root",
      "/private/var/log",
      "/private/tmp",

      // macOS legacy symlinks
      "/etc",
      "/var",
      "/tmp",

      // Windows
      process.env.SystemRoot,
      process.env.WINDIR,
      // process.env.ProgramFiles,
      // process.env["ProgramFiles(x86)"],
      // process.env.ProgramData,
      // process.env.CommonProgramFiles,
      // process.env["CommonProgramFiles(x86)"],
    ]
      .filter(Boolean)
      .map(p => path.resolve(p as string))

    // Normalize to real paths to prevent symlink bypasses
    const resolvedPaths: string[] = []
    for (const p of systemPaths) {
      try {
        resolvedPaths.push(await fs.realpath(p))
      } catch {
        resolvedPaths.push(path.resolve(p))
      }
    }

    return resolvedPaths
  }

  private async protectSystemAndUnsafePaths(file: string, workspaceRoot?: string): Promise<boolean> {
    const resolved = await fs.realpath(file).catch(() => path.resolve(file))

    const scan = async () => {
      if (workspaceRoot) {
        const workspace = path.resolve(workspaceRoot)

        if (!resolved.startsWith(workspace)) {
          return true
        }
      }

      // Allow temp & cache folders
      const tmpdir = await fs.realpath(os.tmpdir())
      if (resolved.startsWith(tmpdir)) {
        return false
      }

      const blockedSystemPaths = await this.getProtectedPaths()
      for (const sys of blockedSystemPaths) {
        if (resolved.startsWith(sys)) {
          return true
        }
      }

      return false
    }

    const unsafe = await scan()

    if (unsafe) {
      log.error({ source: file, realPath: resolved }, `unable to copy, file is from outside the package to a system or unsafe path`)
      throw new Error(`Cannot copy file [${file}] symlinked to file [${resolved}] outside the package to a system or unsafe path`)
    }
    return unsafe
  }
}
