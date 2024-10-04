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
  private readonly unpackedDest: string
  private readonly rootForAppFilesWithoutAsar: string

  constructor(
    private readonly src: string,
    private readonly appOutDir: string,
    private readonly destination: string,
    private readonly options: AsarOptions,
    private readonly unpackPattern: Filter | null
  ) {
    this.outFile = path.join(destination, "app.asar")
    this.unpackedDest = `${this.outFile}.unpacked`
    this.rootForAppFilesWithoutAsar = path.join(this.destination, "app") // convert to use TmpDir
  }

  async pack(fileSets: Array<ResolvedFileSet>, _packager: PlatformPackager<any>) {
    const orderedFileSets = [
      // Write dependencies first to minimize offset changes to asar header
      ...fileSets.slice(1),

      // Finish with the app files that change most often
      fileSets[0],
    ].map(orderFileSet)

    const { unpackedDirs, copiedFiles } = await this.detectAndCopy(orderedFileSets)
    const unpackGlob = unpackedDirs.length > 1 ? `{${unpackedDirs.join(",")}}` : unpackedDirs.pop()

    let ordering = this.options.ordering || undefined
    if (!ordering) {
      ordering = await new tempFile.TmpDir().getTempFile({ prefix: "asar-ordering" })
      // `copiedFiles` are already ordered due to `orderedFileSets`, so we just map to their relative paths (via substring) within the asar.
      const filesSorted = copiedFiles.map(file => file.substring(this.appOutDir.length))
      await fs.writeFile(ordering, filesSorted.join("\n"))
    }

    const options: CreateOptions = {
      unpack: unpackGlob,
      unpackDir: unpackGlob,
      ordering,
    }
    // override logger temporarily to clean up console (electron/asar does some internal logging that blogs up the default electron-builder logs)
    const consoleLogger = console.log
    console.log = (...args) => log.info({ args }, "logging @electron/asar")
    await createPackageWithOptions(this.rootForAppFilesWithoutAsar, this.outFile, options)
    console.log = consoleLogger

    // clean up staging dir
    await fs.rmdir(this.rootForAppFilesWithoutAsar, { recursive: true })
  }

  private async detectAndCopy(fileSets: ResolvedFileSet[]) {
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
      const alreadyIncluded = copiedFiles.has(destination)
      if (alreadyIncluded) {
        return
      }
      copiedFiles.add(destination)

      const stat = await fs.lstat(source)

      // If transformed data, skip symlink logic
      if (transformedData) {
        return this.copyFileOrData(transformedData, source, destination, stat)
      }
      const realPathFile = fs.realpathSync(source)
      const realPathRelative = path.relative(this.src, realPathFile)
      const symlinkDestination = path.resolve(this.rootForAppFilesWithoutAsar, realPathRelative)

      const isOutsidePackage = realPathRelative.startsWith("../")
      if (isOutsidePackage) {
        log.debug(
          { source: source, realPathRelative: realPathRelative, realPathFile: realPathFile, destination: destination },
          `file linked outstide. Skipping symlink, copying file directly`
        )
        const buffer = fs.readFileSync(source)
        return this.copyFileOrData(buffer, source, destination, stat)
      }
      if (source !== realPathFile) {
        await this.copyFileOrData(undefined, source, symlinkDestination, stat)

        // symlinks must be relative to the source file, so we temporarily change dir to the src file dir
        const cwd = process.cwd()
        const dirname = path.dirname(symlinkDestination)
        const src = path.relative(dirname, symlinkDestination)
        const dest = path.relative(dirname, destination)
        process.chdir(dirname)
        fsNode.symlinkSync(src, dest)
        process.chdir(cwd)

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
    await fs.mkdir(path.dirname(destination), { recursive: true })

    if (data) {
      await fs.writeFile(destination, data)
    } else {
      // await this.fileCopier.cTESTopy(source, destination, stat)
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

function writeSymbolicLink(file: string, writePath: string) {
  return new Promise((resolve, reject) => {
    fs.symlink(file, writePath, function (err) {
      if (err && err.code !== "EEXIST") {
        return reject(err)
      }

      resolve(file)
    })
  })
}
