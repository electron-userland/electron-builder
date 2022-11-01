import { CreateOptions, createPackageFromFiles } from "asar"
import { AsyncTaskManager, log } from "builder-util"
import { FileCopier, Filter, MAX_FILE_REQUESTS } from "builder-util/out/fs"
import { Stats } from "fs"
import * as fs from "fs-extra"
import { mkdir, rmdir, stat, writeFile } from "fs/promises"
import * as path from "path"
import { AsarOptions } from "../options/PlatformSpecificBuildOptions"
import { Packager } from "../packager"
import { PlatformPackager } from "../platformPackager"
import { ResolvedFileSet } from "../util/appFileCopier"
import { detectUnpackedDirs } from "./unpackDetector"

/** @internal */
export class AsarPackager {
  private readonly outFile: string
  private readonly fileCopier = new FileCopier()
  private readonly rootForAppFilesWithoutAsar: string
  constructor(private readonly src: string, private readonly destination: string, private readonly options: AsarOptions, private readonly unpackPattern: Filter | null) {
    this.outFile = path.join(destination, "app.asar")
    this.rootForAppFilesWithoutAsar = path.join(this.destination, "app")
  }

  async pack(fileSets: Array<ResolvedFileSet>, packager: PlatformPackager<any>) {
    await this.electronAsarPack(fileSets, packager.info)
  }

  private async electronAsarPack(fileSets: Array<ResolvedFileSet>, packager: Packager) {
    const { unpackedDirs, copiedFiles } = await this.detectAndCopy(packager, fileSets)

    const unpack = await Promise.all(
      unpackedDirs.map(async fileOrDir => {
        let p = fileOrDir
        const stats = await stat(p)
        if (stats.isDirectory()) {
          p = path.join(fileOrDir, "**/*")
        }
        return path.isAbsolute(fileOrDir) ? p : path.join(this.rootForAppFilesWithoutAsar, p)
      })
    )

    const options: CreateOptions = {
      unpack: "{" + unpack.join(",") + "}",
      ordering: this.options.ordering || undefined,
    }
    await createPackageFromFiles(this.rootForAppFilesWithoutAsar, this.outFile, copiedFiles, undefined, options)
    await rmdir(this.rootForAppFilesWithoutAsar, { recursive: true })
  }

  private async detectAndCopy(packager: Packager, fileSets: ResolvedFileSet[]) {
    const taskManager = new AsyncTaskManager(packager.cancellationToken)
    const unpackedDirs = new Set<string>()
    const copiedFiles = new Set<string>()
    for await (const fileSet of fileSets) {
      if (this.options.smartUnpack !== false) {
        detectUnpackedDirs(fileSet, unpackedDirs, this.rootForAppFilesWithoutAsar)
      }
      for await (const file of fileSet.files) {
        if (this.unpackPattern != null && this.unpackPattern(file, await fs.stat(file))) {
          unpackedDirs.add(path.relative(this.src, file))
        }

        const srcRelative = path.relative(this.src, file)
        const dest = path.join(this.rootForAppFilesWithoutAsar, srcRelative)
        await mkdir(path.dirname(dest), { recursive: true })
        taskManager.addTask(copyFileOrData(this.fileCopier, undefined, file, dest, await fs.stat(file)))
        if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
          await taskManager.awaitTasks()
        }
        copiedFiles.add(dest)
      }
    }
    await taskManager.awaitTasks()
    return {
      unpackedDirs: Array.from(unpackedDirs),
      copiedFiles: Array.from(copiedFiles)
    }
  }
}

function copyFileOrData(fileCopier: FileCopier, data: string | Buffer | undefined | null, source: string, destination: string, stats: Stats) {
  if (data == null) {
    return fileCopier.copy(source, destination, stats)
  } else {
    return writeFile(destination, data)
  }
}
