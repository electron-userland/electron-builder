import { CreateOptions, createPackageWithOptions } from "@electron/asar"
import { AsyncTaskManager, log } from "builder-util"
import { CancellationToken } from "builder-util-runtime"
import { Filter, MAX_FILE_REQUESTS } from "builder-util/out/fs"
import * as fsNode from "fs"
import * as fs from "fs-extra"
import * as path from "path"
import * as tempFile from "temp-file"
import { AsarOptions } from "../options/PlatformSpecificBuildOptions"
import { PlatformPackager } from "../platformPackager"
import { ResolvedFileSet, getDestinationPath } from "../util/appFileCopier"
import { detectUnpackedDirs } from "./unpackDetector"

/** @internal */
export class AsarPackager {
  private readonly outFile: string
  private readonly rootForAppFilesWithoutAsar: string
  private readonly tmpDir = new tempFile.TmpDir()

  constructor(
    private readonly config: {
      appDir: string
      defaultDestination: string
      resourcePath: string
      options: AsarOptions
      unpackPattern: Filter | undefined
    }
  ) {
    this.rootForAppFilesWithoutAsar = path.join(config.resourcePath, "app")
    this.outFile = `${this.rootForAppFilesWithoutAsar}.asar`
  }

  async pack(fileSets: Array<ResolvedFileSet>, _packager: PlatformPackager<any>) {
    const cancellationToken = new CancellationToken()
    const orderedFileSets = [
      // Write dependencies first to minimize offset changes to asar header
      ...fileSets.slice(1),

      // Finish with the app files that change most often
      fileSets[0],
    ].map(orderFileSet)

    const { unpackedDirs, copiedFiles } = await this.detectAndCopy(orderedFileSets, cancellationToken)
    const unpackGlob = unpackedDirs.length > 1 ? `{${unpackedDirs.join(",")}}` : unpackedDirs.pop()

    let ordering = this.config.options.ordering || undefined
    if (!ordering) {
      ordering = await this.tmpDir.getTempFile({ prefix: "asar-ordering" })
      // `copiedFiles` are already ordered due to `orderedFileSets`, so we just map to their relative paths (via substring) within the asar.
      const filesSorted = copiedFiles.map(file => file.substring(this.config.defaultDestination.length))
      await fs.writeFile(ordering, filesSorted.join("\n"))
    }

    const options: CreateOptions = {
      unpack: unpackGlob,
      unpackDir: unpackGlob,
      ordering,
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

    // clean up staging dir
    await fs.rm(this.rootForAppFilesWithoutAsar, { recursive: true })
    await this.tmpDir.cleanup()
  }

  private async detectAndCopy(fileSets: ResolvedFileSet[], cancellationToken: CancellationToken) {
    const taskManager = new AsyncTaskManager(cancellationToken)
    const unpackedDirs = new Set<string>()
    const copiedFiles = new Set<string>()

    const autoUnpack = async (file: string, dest: string) => {
      if (this.config.unpackPattern?.(file, await fs.lstat(file))) {
        log.debug({ file }, "unpacking file")
        unpackedDirs.add(dest)
      }
    }
    const autoCopy = async (transformedData: string | Buffer | undefined, source: string, destination: string) => {
      const stat = await fs.lstat(source)
      copiedFiles.add(destination)

      // If transformed data, skip symlink logic
      if (transformedData) {
        return this.copyFileOrData(transformedData, source, destination, stat)
      }
      const realPathFile = await fs.realpath(source)
      const realPathRelative = path.relative(this.config.appDir, realPathFile)
      const symlinkDestination = path.resolve(this.rootForAppFilesWithoutAsar, realPathRelative)

      if (source === realPathFile) {
        return this.copyFileOrData(undefined, source, destination, stat)
      } else {
        const isOutsidePackage = realPathRelative.startsWith("../")
        if (isOutsidePackage) {
          log.warn(
            {
              resolution: "skipping symlink, copying file directly",
              source: log.filePath(source),
              realPathFile: log.filePath(realPathFile),
              destination: log.filePath(destination),
            },
            `file symlinked outside package`
          )
          const buffer = await fs.readFile(source)
          return this.copyFileOrData(buffer, source, destination, stat)
        }

        await this.copyFileOrData(undefined, source, symlinkDestination, stat)
        const src = path.relative(path.dirname(symlinkDestination), symlinkDestination)
        fsNode.symlinkSync(src, destination)

        copiedFiles.add(symlinkDestination)
      }
    }

    for await (const fileSet of fileSets) {
      if (this.config.options.smartUnpack !== false) {
        detectUnpackedDirs(fileSet, unpackedDirs, this.rootForAppFilesWithoutAsar)
      }
      for (let i = 0; i < fileSet.files.length; i++) {
        const file = fileSet.files[i]
        const transformedData = fileSet.transformedFiles?.get(i)

        const dest = path.resolve(this.rootForAppFilesWithoutAsar, getDestinationPath(file, fileSet))

        await autoUnpack(file, dest)
        taskManager.addTask(autoCopy(transformedData, file, dest))

        if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
          await taskManager.awaitTasks()
        }
      }
    }
    await taskManager.awaitTasks()
    return {
      unpackedDirs: Array.from(unpackedDirs),
      copiedFiles: Array.from(copiedFiles),
    }
  }

  private async copyFileOrData(data: string | Buffer | undefined, source: string, destination: string, stat: fs.Stats) {
    await fs.mkdir(path.dirname(destination), { recursive: true })
    if (data) {
      await fs.writeFile(destination, data, { mode: stat.mode })
    } else {
      await fs.copyFile(source, destination)
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
