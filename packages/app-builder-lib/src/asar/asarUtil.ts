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

const SYSTEM_PATHS = [
  "/usr",
  "/lib",
  "/bin",
  "/sbin",
  "/System",
  "/Library",
  // os.tmpdir(), // we keep, unit tests run in temp dirs
  // os.homedir(), // we keep, projects can be stored within home dir
  // process.env.PROGRAMFILES, // Windows program files. We don't want to block /AppData
  process.env.WINDIR, // Windows system root
].filter(Boolean) as string[]

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

        this.processParentDirectories(isUnpacked, destination, results)

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
        }
      }
    }
    return results
  }

  private processParentDirectories(isUnpacked: (path: string) => boolean, destination: string, results: AsarStreamType[]) {
    // process parent directories
    let superDir = path.dirname(path.normalize(destination))
    while (superDir !== ".") {
      const dir: AsarDirectory = {
        type: "directory",
        path: superDir,
        unpacked: isUnpacked(superDir),
      }
      // add to results if not already present
      if (!results.some(r => r.path === dir.path)) {
        results.push(dir)
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
    const workspaceRoot = await this.packager.info.getWorkspaceRoot()
    const realPath = await fs.realpath(file)
    const unsafe = await this.isSystemOrUnsafePath(realPath)
    if (unsafe) {
      log.error({ source: file, realPath, workspaceRoot }, `unable to copy, file is symlinked outside the package to a system or unsafe path`)
      throw new Error(
        `Cannot copy file [${file}] symlinked to file [${realPath}] outside the package as that violates asar security integrity (e.g. relative/outside of workspace directory [${workspaceRoot}]).`
      )
    }

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

  async getSystemPaths(): Promise<string[]> {
    const systemPaths = [
      // Generic *nix
      "/usr",
      "/lib",
      "/bin",
      "/sbin",
      "/System",
      "/Library",
      "/private/etc",
      "/private/var",
      "/private/tmp",

      // macOS legacy symlinks
      "/etc",
      "/var",
      "/tmp",

      // Windows
      process.env.SystemRoot,
      process.env.WINDIR,
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
      process.env.ProgramData,
      process.env.CommonProgramFiles,
      process.env["CommonProgramFiles(x86)"],
    ].filter(Boolean) as string[]

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

  async isSystemOrUnsafePath(file: string, workspaceRoot?: string): Promise<boolean> {
    const blockedSystemPaths = await this.getSystemPaths()
    const resolved = await fs.realpath(file).catch(() => path.resolve(file))
    if (workspaceRoot) {
      const workspace = path.resolve(workspaceRoot)

      if (!resolved.startsWith(workspace)) {
        return true
      }
    }
    for (const sys of blockedSystemPaths) {
      if (resolved.startsWith(sys)) {
        return true
      }
    }

      return false
    }

    // async isSymlinkUnsafe(filePath: string, workspaceRoot: string): Promise<{ unsafe: boolean; realPath: string }> {
    //   const realPath = await fs.realpath(filePath)
    //   const rel = path.relative(workspaceRoot, realPath)

    //   // ✅ Safe if inside workspace
    //   if (!rel.startsWith("..")) {
    //     return { unsafe: false, realPath }
    //   }

    //   const normalized = path.normalize(realPath)

    //   // ✅ Allow common package manager storage directories
    //   const allowedPrefixes = ["/node_modules/.pnpm/", "/node_modules/.store/", "/.yarn/cache/", "/.yarn/unplugged/"]

    //   if (allowedPrefixes.some(prefix => normalized.includes(prefix))) {
    //     return { unsafe: false, realPath }
    //   }
    //   // 🚫 Unsafe: points outside workspace and not in allowed dirs
    //   return { unsafe: true, realPath }
    // }

    //   detectPackageManager(workspaceRoot: string): Promise<PackageManagerInfo> {
    //   const npmLock = path.join(workspaceRoot, "package-lock.json")
    //   const pnpmLock = path.join(workspaceRoot, "pnpm-lock.yaml")
    //   const yarnLock = path.join(workspaceRoot, "yarn.lock")
    //   const yarnBerry = path.join(workspaceRoot, ".yarnrc.yml")

    //   const lockfileDirs: string[] = []

    //   if (await fs.pathExists(pnpmLock)) {
    //     // --- pnpm ---
    //     const storeDir = await this.detectPnpmStoreDir(workspaceRoot)
    //     if (storeDir) lockfileDirs.push(storeDir)
    //     return { name: "pnpm", rootDir: workspaceRoot, lockfileDirs }
    //   }

    //   if (await fs.pathExists(yarnBerry)) {
    //     // --- Yarn Berry (v2+) ---
    //     const yarnCache = path.join(workspaceRoot, ".yarn", "cache")
    //     const yarnUnplugged = path.join(workspaceRoot, ".yarn", "unplugged")
    //     for (const d of [yarnCache, yarnUnplugged]) {
    //       if (await fs.pathExists(d)) lockfileDirs.push(d)
    //     }
    //     return { name: "yarn-berry", rootDir: workspaceRoot, lockfileDirs }
    //   }

    //   if (await fs.pathExists(yarnLock)) {
    //     // --- Yarn Classic (v1) ---
    //     const linkedModules = path.join(workspaceRoot, "node_modules")
    //     lockfileDirs.push(linkedModules)
    //     return { name: "yarn-v1", rootDir: workspaceRoot, lockfileDirs }
    //   }

    //   if (await fs.pathExists(npmLock)) {
    //     // --- npm ---
    //     const npmCache = path.join(os.homedir(), ".npm")
    //     lockfileDirs.push(npmCache)
    //     return { name: "npm", rootDir: workspaceRoot, lockfileDirs }
    //   }

    //   // --- Fallback ---
    //   return { name: "unknown", rootDir: workspaceRoot, lockfileDirs }
    // }

    /**
     * Detect pnpm store directory from config or default
     */
    // async detectPnpmStoreDir(workspaceRoot: string): Promise<string | undefined> {
    //   try {
    //     const home = os.homedir()
    //     const defaultStore = path.join(home, ".pnpm-store")
    //     const rcFile = path.join(home, ".npmrc")

    //     if (await fs.pathExists(rcFile)) {
    //       const content = await fs.readFile(rcFile, "utf8")
    //       const match = content.match(/^store-dir\s*=\s*(.+)$/m)
    //       if (match) return path.resolve(match[1])
    //     }

    //     // fallback: look for local virtual store
    //     const virtualStoreDir = path.join(workspaceRoot, "node_modules", ".pnpm")
    //     if (await fs.pathExists(virtualStoreDir)) return virtualStoreDir

    //     return defaultStore
    //   } catch {
    //     return undefined
    //   }
    // }
  }
