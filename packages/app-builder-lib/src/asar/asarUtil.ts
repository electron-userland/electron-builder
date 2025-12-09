import { createPackageFromStreams, AsarStreamType, AsarDirectory } from "@electron/asar"
import { log } from "builder-util"
import { exists, Filter } from "builder-util/out/fs"
import * as fs from "fs-extra"
import { readlink } from "fs-extra"
import * as path from "path"
import { AsarOptions } from "../options/PlatformSpecificBuildOptions.js"
import { PlatformPackager } from "../platformPackager.js"
import { ResolvedFileSet, getDestinationPath } from "../util/appFileCopier.js"
import { detectUnpackedDirs } from "./unpackDetector.js.js"
import { Readable } from "stream"
import * as os from "os"

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
    await this.protectSystemAndUnsafePaths(file, await this.packager.info.getWorkspaceRoot())

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

  private async checkAgainstRoots(target: string, allowRoots: string[]): Promise<boolean> {
    const resolved = await resolvePath(target)

    for (const root of allowRoots) {
      const resolvedRoot = root
      if (resolved === resolvedRoot || resolved?.startsWith(resolvedRoot + path.sep)) {
        return true
      }
    }
    return false
  }

  private async protectSystemAndUnsafePaths(file: string, workspaceRoot: string): Promise<void> {
    const resolved = await resolvePath(file)
    const logFields = { source: file, realPath: resolved }

    const isUnsafe = async () => {
      const workspace = await resolvePath(workspaceRoot)

      if (workspace && resolved?.startsWith(workspace)) {
        // if in workspace, always safe
        return false
      }

      const allowed = await this.checkAgainstRoots(file, await ALLOWLIST)
      if (allowed) {
        return false // allowlist is priority
      }

      const denied = await this.checkAgainstRoots(file, await DENYLIST)
      if (denied) {
        log.error(logFields, `denied access to system or unsafe path`)
        return true
      }
      // default
      log.debug(logFields, `path is outside of explicit safe paths, defaulting to safe`)
      return false
    }

    const unsafe = await isUnsafe()

    if (unsafe) {
      throw new Error(`Cannot copy file [${file}] symlinked to file [${resolved}] outside the package to a system or unsafe path`)
    }
  }
}
