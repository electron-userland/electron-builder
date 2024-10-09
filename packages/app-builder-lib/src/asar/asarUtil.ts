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
  private rootForAppFilesWithoutAsar!: string
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
    this.outFile = path.join(config.resourcePath, `app.asar`)
  }

  async pack(fileSets: Array<ResolvedFileSet>, _packager: PlatformPackager<any>) {
    this.rootForAppFilesWithoutAsar = await this.tmpDir.getTempDir({ prefix: "asar-app" })

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
    const writeFileOrSymlink = async (transformedData: string | Buffer | undefined, source: string, destination: string, stat: fs.Stats) => {
      copiedFiles.add(destination)

      // If transformed data, skip symlink logic
      if (transformedData) {
        return this.copyFileOrData(transformedData, source, destination, stat)
      }

      const realPathFile = await fs.realpath(source)

      if (source === realPathFile) {
        return this.copyFileOrData(undefined, source, destination, stat)
      } else {
        const realPathRelative = path.relative(this.config.appDir, realPathFile)
        const symlinkTarget = path.resolve(this.rootForAppFilesWithoutAsar, realPathRelative)
        const isOutsidePackage = realPathRelative.startsWith("../")
        if (isOutsidePackage) {
          log.error({ source: log.filePath(source), realPathFile: log.filePath(realPathFile) }, `unable to copy, file is symlinked outside the package`)
          throw new Error(
            `Cannot copy file (${path.basename(source)}) symlinked to file (${path.basename(realPathFile)}) outside the package as that violates asar security integrity`
          )
        }

        await this.copyFileOrData(undefined, source, symlinkTarget, stat)
        const target = path.relative(path.dirname(destination), symlinkTarget)
        fsNode.symlinkSync(target, destination)

        copiedFiles.add(symlinkTarget)
      }
    }

    for await (const fileSet of fileSets) {
      if (this.config.options.smartUnpack !== false) {
        detectUnpackedDirs(fileSet, unpackedPaths, this.config.defaultDestination)
      }
      for (let i = 0; i < fileSet.files.length; i++) {
        const file = fileSet.files[i]
        const transformedData = fileSet.transformedFiles?.get(i)
        const metadata = fileSet.metadata.get(file) || (await fs.lstat(file))

        const relative = path.relative(this.config.defaultDestination, getDestinationPath(file, fileSet))
        const dest = path.resolve(this.rootForAppFilesWithoutAsar, relative)

        matchUnpacker(file, dest, metadata)
        taskManager.addTask(writeFileOrSymlink(transformedData, file, dest, metadata))

        if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
          await taskManager.awaitTasks()
        }
      }
    }
    await taskManager.awaitTasks()
    return {
      unpackedPaths: Array.from(unpackedPaths),
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
