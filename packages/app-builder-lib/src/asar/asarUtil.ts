import BluebirdPromise from "bluebird-lst"

import { CreateOptions, createPackageWithOptions } from "@electron/asar"
import { AsyncTaskManager, log } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { CONCURRENCY, copyDir, DO_NOT_USE_HARD_LINKS, FileCopier, Filter, FilterStats, Link, MAX_FILE_REQUESTS } from "builder-util/out/fs"
import * as fsNode from "fs"
import * as fs from "fs-extra"
import * as path from "path"
import * as tempFile from "temp-file"
import { AsarOptions } from "../options/PlatformSpecificBuildOptions"
import { PlatformPackager } from "../platformPackager"
import { ResolvedFileSet, getDestinationPath } from "../util/appFileCopier"
import { detectUnpackedDirs } from "./unpackDetector"
import { platform } from "os"
import { mkdir, readlink, symlink } from "fs-extra"

/** @internal */
export class AsarPackager {
  private readonly outFile: string
  private readonly rootForAppFilesWithoutAsar: string
  private readonly tmpDir = new tempFile.TmpDir()
  private readonly fileCopier = new FileCopier(DO_NOT_USE_HARD_LINKS)

  constructor(
    private readonly config: {
      defaultDestination: string
      resourcePath: string
      options: AsarOptions
      unpackPattern: Filter | undefined
    }
  ) {
    this.outFile = path.join(config.resourcePath, `app.asar`)
    this.rootForAppFilesWithoutAsar = path.join(config.resourcePath, "app")
  }

  async pack(fileSets: Array<ResolvedFileSet>, _packager: PlatformPackager<any>) {
    // this.rootForAppFilesWithoutAsar = await this.tmpDir.getTempDir({ prefix: "asar-app" })

    const cancellationToken = new CancellationToken()
    cancellationToken.on("cancel", () => this.tmpDir.cleanupSync())

    const orderedFileSets = [
      // Write dependencies first to minimize offset changes to asar header
      ...fileSets.slice(1),

      // Finish with the app files that change most often
      fileSets[0],
    ].map(orderFileSet)

    const { unpackedPaths, copiedFiles } = await this.detectAndCopy(orderedFileSets, cancellationToken)
    const unpackGlob = unpackedPaths.length > 1 ? `{${unpackedPaths.join(",")}}` : unpackedPaths.pop()

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

    await this.tmpDir.cleanup()
    fsNode.rmSync(this.rootForAppFilesWithoutAsar, { recursive: true })
  }

  private async detectAndCopy(fileSets: ResolvedFileSet[], cancellationToken: CancellationToken) {
    const taskManager = new AsyncTaskManager(cancellationToken)
    const unpackedPaths = new Set<string>()
    const copiedFiles = new Set<string>()

    const matchUnpacker = (file: string, dest: string, stat: fs.Stats) => {
      if (this.config.unpackPattern?.(file, stat)) {
        log.debug({ file }, "unpacking")
        unpackedPaths.add(dest)
        return
      }
    }
    const writeFileOrSymlink = async (options: { transformedData: string | Buffer | undefined; file: string; destination: string; stat: fs.Stats; fileSet: ResolvedFileSet }) => {
      const {
        transformedData,
        file: source,
        // destination,
        stat,
        fileSet: { src: sourceDir, destination: destinationDir },
      } = options
      const destination = getDestinationPath(source, options.fileSet)
      if (copiedFiles.has(destination)) {
        return
      }
      copiedFiles.add(destination)

      // If transformed data, skip symlink logic
      if (transformedData != null) {
        return this.copyFileOrData(transformedData, source, destination, stat)
      }

      const realPathFile = await fs.realpath(source)

      if (source === realPathFile) {
        return this.copyFileOrData(undefined, source, destination, stat)
      }

      const realPathRelative = path.relative(sourceDir, realPathFile)
      const isOutsidePackage = realPathRelative.startsWith("..")
      if (isOutsidePackage) {
        log.error({ source: log.filePath(source), realPathFile: log.filePath(realPathFile) }, `unable to copy, file is symlinked outside the package`)
        throw new Error(
          `Cannot copy file (${path.basename(source)}) symlinked to file (${path.basename(realPathFile)}) outside the package as that violates asar security integrity`
        )
      }

      // await this.copyFileOrData(undefined, source, destination, stat)
      // const symlinkTarget = path.resolve(this.rootForAppFilesWithoutAsar, realPathRelative)
      const symlinkTarget = path.resolve(path.dirname(destination), realPathRelative)
      // await this.copyFileOrData(undefined, source, symlinkTarget, stat)
      const target2 = path.relative(path.dirname(destination), symlinkTarget)
      const target = fs.readlinkSync(source)
      fsNode.symlinkSync(target, destination)

      copiedFiles.add(symlinkTarget)
    }

    const createdSourceDirs = new Set<string>()
    const links: Array<Link> = []
    const symlinkType = platform() === "win32" ? "junction" : "file"

    for await (const fileSet of fileSets) {
      if (this.config.options.smartUnpack !== false) {
        detectUnpackedDirs(fileSet, unpackedPaths, this.config.defaultDestination)
      }

      // Don't use BluebirdPromise, we need to retain order of execution/iteration through the ordered fileset
      for (let i = 0; i < fileSet.files.length; i++) {
        const file = fileSet.files[i]
        const transformedData = fileSet.transformedFiles?.get(i)
        const stat = fileSet.metadata.get(file)!
        const destFile = getDestinationPath(file, fileSet)

        matchUnpacker(file, destFile, stat)

        if (!stat.isFile() && !stat.isSymbolicLink()) {
          continue
        }

        const dir = path.dirname(destFile)
        if (!createdSourceDirs.has(dir)) {
          await mkdir(dir, { recursive: true })
          createdSourceDirs.add(dir)
        }

        copiedFiles.add(destFile)
        if (transformedData != null) {
          await fs.writeFile(destFile, transformedData, { mode: stat.mode })
        } else if (stat.isFile()) {
          await this.fileCopier.copy(file, destFile, stat)
        } else {
          let link = await readlink(file)
          if (path.isAbsolute(link)) {
            link = path.relative(path.dirname(file), link)
          }

          const realPathFile = await fs.realpath(file)
          const realPathRelative = path.relative(fileSet.src, realPathFile)
          const isOutsidePackage = realPathRelative.startsWith("..")
          if (isOutsidePackage) {
            log.error({ source: log.filePath(file), realPathFile: log.filePath(realPathFile) }, `unable to copy, file is symlinked outside the package`)
            throw new Error(
              `Cannot copy file (${path.basename(file)}) symlinked to file (${path.basename(realPathFile)}) outside the package as that violates asar security integrity`
            )
          }

          links.push({ file: destFile, link })
        }
        // const file = fileSet.files[i]
        // const transformedData = fileSet.transformedFiles?.get(i)
        // const metadata = fileSet.metadata.get(file)!

        // const relative = path.relative(this.config.defaultDestination, getDestinationPath(file, fileSet))
        // const dest = path.resolve(this.rootForAppFilesWithoutAsar, relative)

        // matchUnpacker(file, dest, metadata)
        // // taskManager.addTask(
        // await writeFileOrSymlink({ transformedData, file, destination: dest, stat: metadata, fileSet })
        // // )

        if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
          await taskManager.awaitTasks()
        }
      }
    }
    // finish copy then set up all symlinks
    await taskManager.awaitTasks()
    for await (const it of links) {
      await symlink(it.link, it.file, symlinkType)
    }
    return {
      unpackedPaths: Array.from(unpackedPaths),
      copiedFiles: Array.from(copiedFiles),
    }
  }

  private async copyFileOrData(data: string | Buffer | undefined, source: string, destination: string, stat: fs.Stats) {
    // const sourceStat = stat || fs.statSync(source)
    // if (sourceStat.isSymbolicLink()) {
    //   return copyDir(source, destination)
    // }
    // if (sourceStat.isSymbolicLink()) {
    //   const link = fs.readlinkSync(source)
    //   // const symlinkTarget = path.resolve(this.rootForAppFilesWithoutAsar, realPathRelative)
    //   // await this.copyFileOrData(undefined, source, symlinkTarget, stat)
    //   const target = path.relative(path.dirname(destination), link)
    //   fsNode.symlinkSync(target, destination)
    //   return
    // }
    await fs.mkdir(path.dirname(destination), { recursive: true })
    if (data != null) {
      return fs.writeFile(destination, data, { mode: stat.mode })
    } else {
      // return fs.copyFile(source, destination)
      return this.fileCopier.copy(source, destination, stat)
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
