import { CreateOptions, createPackageWithOptions } from "@electron/asar"
import { AsyncTaskManager, log } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { FileCopier, Filter, Link, MAX_FILE_REQUESTS } from "builder-util/out/cjs/fs"
import * as fs from "fs-extra"
import { mkdir, readlink, symlink } from "fs-extra"
import { platform } from "os"
import * as path from "path"
import * as tempFile from "temp-file"
import { AsarOptions } from "../options/PlatformSpecificBuildOptions"
import { PlatformPackager } from "../platformPackager"
import { ResolvedFileSet, getDestinationPath } from "../util/appFileCopier"
import { detectUnpackedDirs } from "./unpackDetector"

/** @internal */
export class AsarPackager {
  private readonly outFile: string
  private rootForAppFilesWithoutAsar!: string
  private readonly fileCopier = new FileCopier()
  private readonly tmpDir: tempFile.TmpDir
  private readonly cancellationToken: CancellationToken

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
    this.tmpDir = packager.info.tempDirManager
    this.cancellationToken = packager.info.cancellationToken
  }

  async pack(fileSets: Array<ResolvedFileSet>) {
    this.rootForAppFilesWithoutAsar = await this.tmpDir.getTempDir({ prefix: "asar-app" })

    const orderedFileSets = [
      // Write dependencies first to minimize offset changes to asar header
      ...fileSets.slice(1),

      // Finish with the app files that change most often
      fileSets[0],
    ].map(orderFileSet)

    const { unpackedPaths, copiedFiles } = await this.detectAndCopy(orderedFileSets)
    const unpackGlob = unpackedPaths.length > 1 ? `{${unpackedPaths.join(",")}}` : unpackedPaths.pop()

    await this.executeElectronAsar(copiedFiles, unpackGlob)
  }

  private async executeElectronAsar(copiedFiles: string[], unpackGlob: string | undefined) {
    let ordering = this.config.options.ordering || undefined
    if (!ordering) {
      // `copiedFiles` are already ordered due to `orderedFileSets` input, so we just map to their relative paths (via substring) within the asar.
      const filesSorted = copiedFiles.map(file => file.substring(this.rootForAppFilesWithoutAsar.length))
      ordering = await this.tmpDir.getTempFile({ prefix: "asar-ordering", suffix: ".txt" })
      await fs.writeFile(ordering, filesSorted.join("\n"))
    }

    const options: CreateOptions = {
      unpack: unpackGlob,
      unpackDir: unpackGlob,
      ordering,
      dot: true,
    }
    // override logger temporarily to clean up console (electron/asar does some internal logging that blogs up the default electron-builder logs)
    const consoleLogger = console.log
    console.log = (...args) => {
      if (args[0] === "Ordering file has 100% coverage.") {
        return // no need to log, this means our ordering logic is working correctly
      }
      log.info({ args }, "logging @electron/asar")
    }
    await createPackageWithOptions(this.rootForAppFilesWithoutAsar, this.outFile, options)
    console.log = consoleLogger
  }

  private async detectAndCopy(fileSets: ResolvedFileSet[]) {
    const taskManager = new AsyncTaskManager(this.cancellationToken)
    const unpackedPaths = new Set<string>()
    const copiedFiles = new Set<string>()

    const createdSourceDirs = new Set<string>()
    const links: Array<Link> = []
    const symlinkType = platform() === "win32" ? "junction" : "file"

    const matchUnpacker = (file: string, dest: string, stat: fs.Stats, tmpUnpackedPaths: Set<string>) => {
      if (this.config.unpackPattern?.(file, stat)) {
        log.debug({ file }, "unpacking")
        tmpUnpackedPaths.add(dest)
        return
      }
    }
    const writeFileOrProcessSymlink = async (options: {
      file: string
      destination: string
      stat: fs.Stats
      fileSet: ResolvedFileSet
      transformedData: string | Buffer | undefined
    }) => {
      const { transformedData, file, destination, stat, fileSet } = options
      if (!stat.isFile() && !stat.isSymbolicLink()) {
        return
      }
      copiedFiles.add(destination)

      const dir = path.dirname(destination)
      if (!createdSourceDirs.has(dir)) {
        await mkdir(dir, { recursive: true })
        createdSourceDirs.add(dir)
      }

      // write any data if provided, skip symlink check
      if (transformedData != null) {
        return fs.writeFile(destination, transformedData, { mode: stat.mode })
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
        return this.fileCopier.copy(file, destination, stat)
      }

      // okay, it must be a symlink. evaluate link to be relative to source file in asar
      let link = await readlink(file)
      if (path.isAbsolute(link)) {
        link = path.relative(path.dirname(file), link)
      }
      links.push({ file: destination, link })
    }

    for (const fileSet of fileSets) {
      if (this.config.options.smartUnpack !== false) {
        detectUnpackedDirs(fileSet, unpackedPaths)
      }

      // Don't use Promise.all, we need to retain order of execution/iteration through the ordered fileset
      const tmpUnpackedPaths = new Set<string>()
      for (let i = 0; i < fileSet.files.length; i++) {
        const file = fileSet.files[i]
        const transformedData = fileSet.transformedFiles?.get(i)
        const stat = fileSet.metadata.get(file)!

        const relative = path.relative(this.config.defaultDestination, getDestinationPath(file, fileSet))
        const destination = path.resolve(this.rootForAppFilesWithoutAsar, relative)

        matchUnpacker(file, destination, stat, tmpUnpackedPaths)
        taskManager.addTask(writeFileOrProcessSymlink({ transformedData, file, destination, stat, fileSet }))

        if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
          await taskManager.awaitTasks()
        }
      }

      if (tmpUnpackedPaths.size === fileSet.files.length) {
        const relative = path.relative(this.config.defaultDestination, fileSet.destination)
        unpackedPaths.add(relative)
      } else {
        // add all tmpUnpackedPaths to unpackedPaths
        for (const it of tmpUnpackedPaths) {
          unpackedPaths.add(it)
        }
      }
    }
    // finish copy then set up all symlinks
    await taskManager.awaitTasks()
    for (const it of links) {
      taskManager.addTask(symlink(it.link, it.file, symlinkType))

      if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
        await taskManager.awaitTasks()
      }
    }
    await taskManager.awaitTasks()
    return {
      unpackedPaths: Array.from(unpackedPaths),
      copiedFiles: Array.from(copiedFiles),
    }
  }
}

function orderFileSet(fileSet: ResolvedFileSet): ResolvedFileSet {
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
