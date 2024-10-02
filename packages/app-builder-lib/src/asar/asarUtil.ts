import { CreateOptions, createPackageFromFiles } from "@electron/asar"
import { AsyncTaskManager, log } from "builder-util"
import { FileCopier, Filter, MAX_FILE_REQUESTS } from "builder-util/out/fs"
import * as fs from "fs-extra"
import { mkdir, rm, writeFile } from "fs/promises"
import * as path from "path"
import { AsarOptions } from "../options/PlatformSpecificBuildOptions"
import { Packager } from "../packager"
import { PlatformPackager } from "../platformPackager"
import { ResolvedFileSet, getDestinationPath } from "../util/appFileCopier"
import { detectUnpackedDirs } from "./unpackDetector"
import { homedir, tmpdir } from "os"
import * as asar from "@electron/asar"
import { PathLike, symlink } from "fs"
import { CancellationToken } from "builder-util-runtime"

const pickle = require("chromium-pickle-js")

/** @internal */
export class AsarPackager {
  // private readonly fs = new AsarFilesystem(this.src)
  private readonly outFile: string
  private readonly unpackedDest: string
  private readonly rootForAppFilesWithoutAsar: string

  constructor(
    private readonly src: string,
    private readonly destination: string,
    private readonly options: AsarOptions,
    private readonly unpackPattern: Filter | null
  ) {
    this.outFile = path.join(destination, "app.asar")
    this.unpackedDest = `${this.outFile}.unpacked`
    this.rootForAppFilesWithoutAsar = path.join(this.destination, "app")
  }

  async pack(fileSets: Array<ResolvedFileSet>, packager: PlatformPackager<any>) {
    const orderedFileSets = [
      // Write dependencies first to minimize offset changes to asar header
      ...fileSets.slice(1),

      // Finish with the app files that change most often
      fileSets[0],
    ].map(orderFileSet)

    const { unpackedDirs: unpack, copiedFiles } = await this.detectAndCopy(packager as any, orderedFileSets)

    const unpackGlob = unpack.length > 1 ? `{${unpack.join(",")}}` : unpack.pop()

    const orderingFile = this.options.ordering || undefined
    if (!orderingFile) {
      const orderedFiles = orderedFileSets.flatMap(set => set.files)
      console.error(orderedFiles)
    }

    const options: CreateOptions = {
      unpack: unpackGlob,
      unpackDir: unpackGlob,
      ordering: orderingFile,
      dot: true,
    }
    await asar.createPackageWithOptions(this.rootForAppFilesWithoutAsar, this.outFile, options)
    await fs.rmdir(this.rootForAppFilesWithoutAsar, { recursive: true })
  }

  private async detectAndCopy(packager: Packager, fileSets: ResolvedFileSet[]) {
    const cancellationToken = new CancellationToken()
    const taskManager = new AsyncTaskManager(cancellationToken)
    const unpackedDirs = new Set<string>()
    const copiedFiles = new Set<string>()

    const autoUnpack = async (file: string, dest: string) => {
      const newLocal = await fs.lstat(file)
      if (this.unpackPattern?.(file, newLocal)) {
        log.info({ file }, "unpacking")
        unpackedDirs.add(dest)
      }
    }
    const autoCopy = async (transformedData: string | Buffer | undefined, source: string, destination: string) => {
      const realPathFile = fs.realpathSync(source)
      // console.error(this.src)
      const realPathRelative = path.relative(this.src, realPathFile)
      const symlinkDestination = path.resolve(this.rootForAppFilesWithoutAsar, realPathRelative)
      const alreadyIncluded = copiedFiles.has(destination)
      const stat = await fs.lstat(source)

      // log.error(
      //   {
      //     source,
      //     destination,
      //     realPathFile,
      //     realPathRelative,
      //     symlinkDestination,
      //     isSymbolicLink: stat.isSymbolicLink(),
      //     alreadyIncluded,
      //   },
      //   "autoCopy"
      // )

      if (alreadyIncluded) {
        return
      }
      copiedFiles.add(destination)

      // If transformed data, skip symlink logic
      if (transformedData) {
        return this.copyFileOrData(transformedData, source, destination, stat)
      }

      const isOutsidePackage = realPathRelative.substring(0, 2) === ".."
      if (isOutsidePackage) {
        log.warn({ source, realPathRelative, realPathFile, destination }, `file linked outstide. Skipping symlink, copying file directly`)
        const buffer = fs.readFileSync(source)
        return this.copyFileOrData(buffer, source, destination, stat)
      }
      if (source !== realPathFile) {
        await this.copyFileOrData(undefined, realPathFile, symlinkDestination, stat)
        await mkdir(path.dirname(destination), { recursive: true })
        await fs.symlink(symlinkDestination, destination)
        copiedFiles.add(symlinkDestination)
      } else {
        await this.copyFileOrData(undefined, source, destination, stat)
      }
    }

    for await (const fileSet of fileSets) {
      if (this.options.smartUnpack !== false) {
        detectUnpackedDirs(fileSet, unpackedDirs, this.rootForAppFilesWithoutAsar)
      }
      for (let i = 0; i < fileSet.files.length; i++) {
        const file = fileSet.files[i]
        // log.error({ file }, "file")
        // console.error(file)
        const transformedData = fileSet.transformedFiles?.get(i)

        // const srcFile = path.resolve(this.src, file)
        // const srcRelative = path.relative(packager.appDir, file)
        const dest = path.resolve(this.rootForAppFilesWithoutAsar, getDestinationPath(file, fileSet))

        await autoUnpack(file, dest)
        await autoCopy(transformedData, file, dest)
        // taskManager.addTask(autoCopy(transformedData, file, dest))

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
    await mkdir(path.dirname(destination), { recursive: true })

    if (data) {
      await fs.writeFile(destination, data)
    } else {
      // await this.fileCopier.copy(source, destination, stat)
      await fs.copyFile(source, destination)
    }
    await fs.chmod(destination, stat.mode)
  }
}

function orderFileSet(fileSet: ResolvedFileSet): ResolvedFileSet {
  const sortedFileEntries = Array.from(fileSet.files.entries())

  sortedFileEntries.sort(([, a], [, b]) => {
    if (a === b) {
      return 0
    }

    // Place addons last because their signature change
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
