import { AsyncTaskManager, log } from "builder-util"
import { FileCopier, Filter, MAX_FILE_REQUESTS } from "builder-util/out/fs"
import { symlink } from "fs"
import { createReadStream, createWriteStream, ensureDir, readFile, Stats, writeFile } from "fs-extra"
import * as path from "path"
import { AsarOptions } from ".."
import { Packager } from "../packager"
import { PlatformPackager } from "../platformPackager"
import { getDestinationPath, ResolvedFileSet } from "../util/appFileCopier"
import { AsarFilesystem, Node } from "./asar"
import { detectUnpackedDirs } from "./unpackDetector"

const pickle = require("chromium-pickle-js")

/** @internal */
export class AsarPackager {
  private readonly fs = new AsarFilesystem(this.src)
  private readonly outFile: string
  private readonly unpackedDest: string

  constructor(private readonly src: string, private readonly destination: string, private readonly options: AsarOptions, private readonly unpackPattern: Filter | null) {
    this.outFile = path.join(destination, "app.asar")
    this.unpackedDest = `${this.outFile}.unpacked`
  }

  // sort files to minimize file change (i.e. asar file is not changed dramatically on small change)
  async pack(fileSets: Array<ResolvedFileSet>, packager: PlatformPackager<any>) {
    if (this.options.ordering != null) {
      // ordering doesn't support transformed files, but ordering is not used functionality - wait user report to fix it
      await order(fileSets[0].files, this.options.ordering, fileSets[0].src)
    }
    await ensureDir(path.dirname(this.outFile))
    const unpackedFileIndexMap = new Map<ResolvedFileSet, Set<number>>()
    for (const fileSet of fileSets) {
      unpackedFileIndexMap.set(fileSet, await this.createPackageFromFiles(fileSet, packager.info))
    }
    await this.writeAsarFile(fileSets, unpackedFileIndexMap)
  }

  private async createPackageFromFiles(fileSet: ResolvedFileSet, packager: Packager) {
    const metadata = fileSet.metadata
    // search auto unpacked dir
    const unpackedDirs = new Set<string>()
    const rootForAppFilesWithoutAsar = path.join(this.destination, "app")

    if (this.options.smartUnpack !== false) {
      await detectUnpackedDirs(fileSet, unpackedDirs, this.unpackedDest, rootForAppFilesWithoutAsar)
    }

    const dirToCreateForUnpackedFiles = new Set<string>(unpackedDirs)

    const correctDirNodeUnpackedFlag = async (filePathInArchive: string, dirNode: Node) => {
      for (const dir of unpackedDirs) {
        if (filePathInArchive.length > (dir.length + 2) && filePathInArchive[dir.length] === path.sep && filePathInArchive.startsWith(dir)) {
          dirNode.unpacked = true
          unpackedDirs.add(filePathInArchive)
          // not all dirs marked as unpacked after first iteration - because node module dir can be marked as unpacked after processing node module dir content
          // e.g. node-notifier/example/advanced.js processed, but only on process vendor/terminal-notifier.app module will be marked as unpacked
          await ensureDir(path.join(this.unpackedDest, filePathInArchive))
          break
        }
      }
    }

    const transformedFiles = fileSet.transformedFiles
    const taskManager = new AsyncTaskManager(packager.cancellationToken)
    const fileCopier = new FileCopier()

    let currentDirNode: Node | null = null
    let currentDirPath: string | null = null

    const unpackedFileIndexSet = new Set<number>()

    for (let i = 0, n = fileSet.files.length; i < n; i++) {
      const file = fileSet.files[i]
      const stat = metadata.get(file)
      if (stat == null) {
        continue
      }

      const pathInArchive = path.relative(rootForAppFilesWithoutAsar, getDestinationPath(file, fileSet))

      if (stat.isSymbolicLink()) {
        const s = (stat as any)
        this.fs.getOrCreateNode(pathInArchive).link = s.relativeLink
        s.pathInArchive = pathInArchive
        unpackedFileIndexSet.add(i)
        continue
      }

      let fileParent = path.dirname(pathInArchive)
      if (fileParent === ".") {
        fileParent = ""
      }

      if (currentDirPath !== fileParent) {
        if (fileParent.startsWith("..")) {
          throw new Error(`Internal error: path must not start with "..": ${fileParent}`)
        }

        currentDirPath = fileParent
        currentDirNode = this.fs.getOrCreateNode(fileParent)
        // do not check for root
        if (fileParent !== "" && !currentDirNode.unpacked) {
          if (unpackedDirs.has(fileParent)) {
            currentDirNode.unpacked = true
          }
          else {
            await correctDirNodeUnpackedFlag(fileParent, currentDirNode)
          }
        }
      }

      const dirNode = currentDirNode!
      const newData = transformedFiles == null ? null : transformedFiles.get(i)
      const isUnpacked = dirNode.unpacked || (this.unpackPattern != null && this.unpackPattern(file, stat))
      this.fs.addFileNode(file, dirNode, newData == null ? stat.size : Buffer.byteLength(newData), isUnpacked, stat)
      if (isUnpacked) {
        if (!dirNode.unpacked && !dirToCreateForUnpackedFiles.has(fileParent)) {
          dirToCreateForUnpackedFiles.add(fileParent)
          await ensureDir(path.join(this.unpackedDest, fileParent))
        }

        const unpackedFile = path.join(this.unpackedDest, pathInArchive)
        taskManager.addTask(copyFileOrData(fileCopier, newData, file, unpackedFile, stat))
        if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
          await taskManager.awaitTasks()
        }

        unpackedFileIndexSet.add(i)
      }
    }

    if (taskManager.tasks.length > 0) {
      await taskManager.awaitTasks()
    }

    return unpackedFileIndexSet
  }

  private writeAsarFile(fileSets: Array<ResolvedFileSet>, unpackedFileIndexMap: Map<ResolvedFileSet, Set<number>>): Promise<any> {
    return new Promise((resolve, reject) => {
      const headerPickle = pickle.createEmpty()
      headerPickle.writeString(JSON.stringify(this.fs.header))
      const headerBuf = headerPickle.toBuffer()

      const sizePickle = pickle.createEmpty()
      sizePickle.writeUInt32(headerBuf.length)

      const sizeBuf = sizePickle.toBuffer()
      const writeStream = createWriteStream(this.outFile)
      writeStream.on("error", reject)
      writeStream.on("close", resolve)
      writeStream.write(sizeBuf)

      let fileSetIndex = 0

      let files = fileSets[0].files
      let metadata = fileSets[0].metadata
      let transformedFiles = fileSets[0].transformedFiles
      let unpackedFileIndexSet = unpackedFileIndexMap.get(fileSets[0])!!
      const w = (index: number) => {
        while (true) {
          if (index >= files.length) {
            if (++fileSetIndex >= fileSets.length) {
              writeStream.end()
              return
            }
            else {
              files = fileSets[fileSetIndex].files
              metadata = fileSets[fileSetIndex].metadata
              transformedFiles = fileSets[fileSetIndex].transformedFiles
              unpackedFileIndexSet = unpackedFileIndexMap.get(fileSets[fileSetIndex])!!
              index = 0
            }
          }

          if (!unpackedFileIndexSet.has(index)) {
            break
          }
          else {
            const stat = metadata.get(files[index])
            if (stat != null && stat.isSymbolicLink()) {
              symlink((stat as any).linkRelativeToFile, path.join(this.unpackedDest, (stat as any).pathInArchive), () => w(index + 1))
              return
            }
          }
          index++
        }

        const data = transformedFiles == null ? null : transformedFiles.get(index)
        const file = files[index]
        if (data !== null && data !== undefined) {
          writeStream.write(data, () => w(index + 1))
          return
        }

        // https://github.com/yarnpkg/yarn/pull/3539
        const stat = metadata.get(file)
        if (stat != null && stat.size < (2 * 1024 * 1024)) {
          readFile(file)
            .then(it => {
              writeStream.write(it, () => w(index + 1))
            })
            .catch(e => reject(`Cannot read file ${file}: ${e.stack || e}`))
        }
        else {
          const readStream = createReadStream(file)
          readStream.on("error", reject)
          readStream.once("end", () => w(index + 1))
          readStream.pipe(writeStream, {
            end: false
          })
        }
      }

      writeStream.write(headerBuf, () => w(0))
    })
  }
}

async function order(filenames: Array<string>, orderingFile: string, src: string) {
  const orderingFiles = (await readFile(orderingFile, "utf8")).split("\n").map(line => {
    if (line.indexOf(":") !== -1) {
      line = line.split(":").pop()!
    }
    line = line.trim()
    if (line[0] === "/") {
      line = line.slice(1)
    }
    return line
  })

  const ordering: Array<string> = []
  for (const file of orderingFiles) {
    const pathComponents = file.split(path.sep)
    for (const pathComponent of pathComponents) {
      ordering.push(path.join(src, pathComponent))
    }
  }

  const sortedFiles: Array<string> = []
  let missing = 0
  const total = filenames.length
  for (const file of ordering) {
    if (!sortedFiles.includes(file) && filenames.includes(file)) {
      sortedFiles.push(file)
    }
  }
  for (const file of filenames) {
    if (!sortedFiles.includes(file)) {
      sortedFiles.push(file)
      missing += 1
    }
  }
  log.info({coverage: ((total - missing) / total * 100)}, "ordering files in ASAR archive")
  return sortedFiles
}

function copyFileOrData(fileCopier: FileCopier, data: string | Buffer | undefined | null, source: string, destination: string, stats: Stats) {
  if (data == null) {
    return fileCopier.copy(source, destination, stats)
  }
  else {
    return writeFile(destination, data)
  }
}