import { CreateOptions, createPackage, createPackageFromFiles, createPackageWithOptions } from "asar"
import { AsyncTaskManager, log } from "builder-util"
import { FileCopier, Filter, MAX_FILE_REQUESTS } from "builder-util/out/fs"
import { symlink, createReadStream, createWriteStream, Stats, rmSync, fstatSync, statSync, rmdir, rmdirSync } from "fs"
import { writeFile, readFile, mkdir, rm } from "fs/promises"
import * as path from "path"
import { AsarOptions } from "../options/PlatformSpecificBuildOptions"
import { Packager } from "../packager"
import { PlatformPackager } from "../platformPackager"
import { copyAppFiles, getDestinationPath, ResolvedFileSet } from "../util/appFileCopier"
import { AsarFilesystem, Node } from "./asar"
import { hashFile, hashFileContents } from "./integrity"
import { detectUnpackedDirs } from "./unpackDetector"
import * as fs from "fs-extra"
import { promisify } from "util"
import { nextTick } from "process"

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pickle = require("chromium-pickle-js")

/** @internal */
export class AsarPackager {
  private readonly fs = new AsarFilesystem(this.src)
  private readonly outFile: string
  private readonly unpackedDest: string
  private readonly fileCopier = new FileCopier()
  private readonly rootForAppFilesWithoutAsar: string
  constructor(private readonly src: string, private readonly destination: string, private readonly options: AsarOptions, private readonly unpackPattern: Filter | null) {
    this.outFile = path.join(destination, "app.asar")
    // this.unpackedDest = path.join(destination, "app")
    this.rootForAppFilesWithoutAsar = path.join(this.destination, "app")
    this.unpackedDest = `${this.outFile}.unpacked`
  }

  async pack(fileSets: Array<ResolvedFileSet>, packager: PlatformPackager<any>) {
    await this.electronAsarPack(fileSets, packager.info)
  }

  private async electronAsarPack(fileSets: Array<ResolvedFileSet>, packager: Packager) {
    const { unpackedDirs, copiedFiles } = await this.detectAndCopy(packager, fileSets)

    const unpack = Array.from(unpackedDirs).map(fileOrDir => {
      let p = fileOrDir
      if (statSync(p).isDirectory()) {
        p = path.join(fileOrDir, '**/*')
      }
      return path.isAbsolute(fileOrDir) ? p : path.join(this.rootForAppFilesWithoutAsar, p)
    })

    const options: CreateOptions = {
      unpack: "{" + unpack.join(',') + "}",
      ordering: this.options.ordering || undefined
    }

    await createPackageFromFiles(this.rootForAppFilesWithoutAsar, this.outFile,
      Array.from(copiedFiles),
      undefined,
      options
    )
    rmSync(this.rootForAppFilesWithoutAsar, { recursive: true})
  }

  private async detectAndCopy(packager: Packager, fileSets: ResolvedFileSet[]) {
    const taskManager = new AsyncTaskManager(packager.cancellationToken)
    const unpackedDirs = new Set<string>()
    const copiedFiles = new Set<string>()
    for await (const fileSet of fileSets) {
      if (this.options.smartUnpack !== false) {
        await detectUnpackedDirs(fileSet, unpackedDirs, this.unpackedDest, this.rootForAppFilesWithoutAsar)
      }
      for await (const file of fileSet.files) {
        if (this.unpackPattern != null && this.unpackPattern(file, await fs.stat(file))) {
          unpackedDirs.add(path.relative(this.src, file))
        }
      }
      for await (const file of fileSet.files) {
        const srcRelative = path.relative(this.src, file)
        const dest = path.join(this.rootForAppFilesWithoutAsar, srcRelative)
        await mkdir(path.dirname(dest), { recursive: true })
        taskManager.addTask(copyFileOrData(this.fileCopier, undefined, file, dest, await fs.stat(file)))
        if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
          await taskManager.awaitTasks()
        }
        copiedFiles.add(dest)
      }
      await taskManager.awaitTasks()
    }
    console.log('unpackedDirs', unpackedDirs)
    return { unpackedDirs, copiedFiles }
  }
}

function copyFileOrData(fileCopier: FileCopier, data: string | Buffer | undefined | null, source: string, destination: string, stats: Stats) {
  if (data == null) {
    return fileCopier.copy(source, destination, stats)
  } else {
    return writeFile(destination, data)
  }
}
