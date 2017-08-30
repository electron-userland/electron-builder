import BluebirdPromise from "bluebird-lst"
import { AsyncTaskManager, debug, log } from "builder-util"
import { CONCURRENCY, FileCopier, Filter, MAX_FILE_REQUESTS, statOrNull } from "builder-util/out/fs"
import { createReadStream, createWriteStream, ensureDir, readFile, Stats, writeFile } from "fs-extra-p"
import * as path from "path"
import { AsarFilesystem, Node, readAsar } from "../asar"
import { AsarOptions } from "../configuration"
import { Packager } from "../packager"
import { PlatformPackager } from "../platformPackager"
import { ensureEndSlash, FileSet, NODE_MODULES_PATTERN } from "./AppFileCopierHelper"

const isBinaryFile: any = BluebirdPromise.promisify(require("isbinaryfile"))
const pickle = require("chromium-pickle-js")

function addValue(map: Map<string, Array<string>>, key: string, value: string) {
  let list = map.get(key)
  if (list == null) {
    list = [value]
    map.set(key, list)
  }
  else {
    list.push(value)
  }
}

export function copyFileOrData(fileCopier: FileCopier, data: string | Buffer | undefined | null, source: string, destination: string, stats: Stats) {
  if (data == null) {
    return fileCopier.copy(source, destination, stats)
  }
  else {
    return writeFile(destination, data)
  }
}

/** @internal */
export class AsarPackager {
  private readonly fs = new AsarFilesystem(this.src)
  private readonly outFile: string

  constructor(private readonly src: string, destination: string, private readonly options: AsarOptions, private readonly unpackPattern: Filter | null) {
    this.outFile = path.join(destination, "app.asar")
  }

  // sort files to minimize file change (i.e. asar file is not changed dramatically on small change)
  async pack(fileSets: Array<FileSet>, packager: PlatformPackager<any>) {
    if (this.options.ordering != null) {
      // ordering doesn't support transformed files, but ordering is not used functionality - wait user report to fix it
      await order(fileSets[0].files, this.options.ordering, fileSets[0].src)
    }
    await ensureDir(path.dirname(this.outFile))
    for (const fileSet of fileSets) {
      await this.createPackageFromFiles(fileSet, packager.info)
    }
    await this.writeAsarFile(fileSets)
  }

  private async createPackageFromFiles(fileSet: FileSet, packager: Packager) {
    const metadata = fileSet.metadata
    // search auto unpacked dir
    const unpackedDirs = new Set<string>()
    const unpackedDest = `${this.outFile}.unpacked`

    if (this.options.smartUnpack !== false) {
      await detectUnpackedDirs(fileSet, unpackedDirs, unpackedDest)
    }

    const dirToCreateForUnpackedFiles = new Set<string>(unpackedDirs)

    const isDirNodeUnpacked = async (file: string, dirNode: Node) => {
      if (dirNode.unpacked) {
        return
      }

      if (unpackedDirs.has(file)) {
        dirNode.unpacked = true
      }
      else {
        for (const dir of unpackedDirs) {
          if (file.length > (dir.length + 2) && file[dir.length] === path.sep && file.startsWith(dir)) {
            dirNode.unpacked = true
            unpackedDirs.add(file)
            // not all dirs marked as unpacked after first iteration - because node module dir can be marked as unpacked after processing node module dir content
            // e.g. node-notifier/example/advanced.js processed, but only on process vendor/terminal-notifier.app module will be marked as unpacked
            await ensureDir(getTargetPath(fileSet, file, unpackedDest))
            break
          }
        }
      }
    }

    const transformedFiles = fileSet.transformedFiles
    const taskManager = new AsyncTaskManager(packager.cancellationToken)
    const fileCopier = new FileCopier()

    let currentDirNode: Node | null = null
    let currentDirPath: string | null = null

    for (let i = 0, n = fileSet.files.length; i < n; i++) {
      const file = fileSet.files[i]
      const stat = metadata.get(file)
      if (stat != null && stat.isFile()) {
        const fileParent = path.dirname(file)

        if (currentDirPath !== fileParent) {
          currentDirPath = fileParent
          currentDirNode = this.fs.getOrCreateNode(getRelativePath(fileSet, fileParent))
          await isDirNodeUnpacked(fileParent, currentDirNode)
        }

        const dirNode = currentDirNode!
        const newData = transformedFiles == null ? null : transformedFiles[i] as string | Buffer
        const isUnpacked = dirNode.unpacked || (this.unpackPattern != null && this.unpackPattern(file, stat))
        this.fs.addFileNode(file, dirNode, newData == null ? stat.size : Buffer.byteLength(newData as any), isUnpacked, stat)
        if (isUnpacked) {
          if (newData != null) {
            transformedFiles[i] = null
          }

          if (!dirNode.unpacked && !dirToCreateForUnpackedFiles.has(fileParent)) {
            dirToCreateForUnpackedFiles.add(fileParent)
            await ensureDir(getTargetPath(fileSet, fileParent, unpackedDest))
          }

          const unpackedFile = getTargetPath(fileSet, file, unpackedDest)
          taskManager.addTask(copyFileOrData(fileCopier, newData, file, unpackedFile, stat))
          if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
            await taskManager.awaitTasks()
          }
        }
        else if (newData == null) {
          transformedFiles[i] = true
        }
      }
      else if (stat == null || stat.isDirectory()) {
        let unpacked = false
        if (unpackedDirs.has(file)) {
          unpacked = true
        }
        else {
          for (const dir of unpackedDirs) {
            if (file.length > (dir.length + 2) && file[dir.length] === path.sep && file.startsWith(dir)) {
              unpacked = true
              unpackedDirs.add(file)
              // not all dirs marked as unpacked after first iteration - because node module dir can be marked as unpacked after processing node module dir content
              // e.g. node-notifier/example/advanced.js processed, but only on process vendor/terminal-notifier.app module will be marked as unpacked
              await ensureDir(getTargetPath(fileSet, file, unpackedDest))
              break
            }
          }
        }
        this.fs.insertDirectory(getRelativePath(fileSet, file), unpacked)
      }
      else if (stat.isSymbolicLink()) {
        this.fs.getOrCreateNode(getRelativePath(fileSet, file)).link = (stat as any).relativeLink
      }
    }

    if (taskManager.tasks.length > 0) {
      await taskManager.awaitTasks()
    }
  }

  private writeAsarFile(fileSets: Array<FileSet>): Promise<any> {
    const headerPickle = pickle.createEmpty()
    headerPickle.writeString(JSON.stringify(this.fs.header))
    const headerBuf = headerPickle.toBuffer()

    const sizePickle = pickle.createEmpty()
    sizePickle.writeUInt32(headerBuf.length)
    const sizeBuf = sizePickle.toBuffer()

    const writeStream = createWriteStream(this.outFile)
    return new BluebirdPromise((resolve, reject) => {
      writeStream.on("error", reject)
      writeStream.on("close", resolve)
      writeStream.write(sizeBuf)

      let fileSetIndex = 0

      let files = fileSets[0].files
      let transformedFiles = fileSets[0].transformedFiles
      const w = (index: number) => {
        let data
        while (true) {
          if (index >= files.length) {
            if (++fileSetIndex >= fileSets.length) {
              writeStream.end()
              return
            }
            else {
              files = fileSets[fileSetIndex].files
              transformedFiles = fileSets[fileSetIndex].transformedFiles
              index = 0
            }
          }

          if ((data = transformedFiles[index++]) != null) {
            break
          }
        }

        const file = files[index - 1]
        if (data !== true) {
          writeStream.write(data, () => w(index))
          return
        }

        const readStream = createReadStream(file)
        readStream.on("error", reject)
        readStream.once("end", () => w(index))
        readStream.pipe(writeStream, {
          end: false
        })
      }

      writeStream.write(headerBuf, () => w(0))
    })
  }
}

/** @internal */
export async function checkFileInArchive(asarFile: string, relativeFile: string, messagePrefix: string) {
  function error(text: string) {
    return new Error(`${messagePrefix} "${relativeFile}" in the "${asarFile}" ${text}`)
  }

  let fs
  try {
    fs = await readAsar(asarFile)
  }
  catch (e) {
    throw error(`is corrupted: ${e}`)
  }

  let stat: Node | null
  try {
    stat = fs.getFile(relativeFile)
  }
  catch (e) {
    const fileStat = await statOrNull(asarFile)
    if (fileStat == null) {
      throw error(`does not exist. Seems like a wrong configuration.`)
    }

    // asar throws error on access to undefined object (info.link)
    stat = null
  }

  if (stat == null) {
    throw error(`does not exist. Seems like a wrong configuration.`)
  }
  if (stat.size === 0) {
    throw error(`is corrupted: size 0`)
  }
}

async function detectUnpackedDirs(fileSet: FileSet, autoUnpackDirs: Set<string>, unpackedDest: string) {
  const dirToCreate = new Map<string, Array<string>>()
  const metadata = fileSet.metadata
  for (let i = 0, n = fileSet.files.length; i < n; i++) {
    const file = fileSet.files[i]
    const index = file.lastIndexOf(NODE_MODULES_PATTERN)
    if (index < 0) {
      continue
    }

    let nextSlashIndex = file.indexOf(path.sep, index + NODE_MODULES_PATTERN.length + 1)
    if (nextSlashIndex < 0) {
      continue
    }

    if (file[index + NODE_MODULES_PATTERN.length] === "@") {
      nextSlashIndex = file.indexOf(path.sep, nextSlashIndex + 1)
    }

    if (!metadata.get(file)!.isFile()) {
      continue
    }

    const packageDir = file.substring(0, nextSlashIndex)
    if (autoUnpackDirs.has(packageDir)) {
      const fileParent = path.dirname(file)
      if (fileParent !== packageDir && !autoUnpackDirs.has(fileParent)) {
        autoUnpackDirs.add(fileParent)
        addValue(dirToCreate, getRelativePath(fileSet, packageDir), path.relative(packageDir, fileParent))
      }
      continue
    }

    let shouldUnpack = false
    if (file.endsWith(".dll") || file.endsWith(".exe")) {
      shouldUnpack = true
    }
    else if (!file.includes(".", nextSlashIndex) && path.extname(file) === "") {
      shouldUnpack = await isBinaryFile(file)
    }

    if (!shouldUnpack) {
      continue
    }

    if (debug.enabled) {
      debug(`${getRelativePath(fileSet, packageDir)} is not packed into asar archive - contains executable code`)
    }

    let fileParent = path.dirname(file)

    // create parent dir to be able to copy file later without directory existence check
    addValue(dirToCreate, getRelativePath(fileSet, packageDir), path.relative(packageDir, fileParent))

    while (fileParent !== packageDir) {
      autoUnpackDirs.add(fileParent)
      fileParent = path.dirname(fileParent)
    }
    autoUnpackDirs.add(packageDir)
  }

  if (dirToCreate.size > 0) {
    // child directories should be not created asynchronously - parent directories should be created first
    await BluebirdPromise.map(dirToCreate.keys(), async it => {
      const base = path.join(unpackedDest, it)
      await ensureDir(base)
      await BluebirdPromise.each(dirToCreate.get(it)!, it => ensureDir(path.join(base, it)))
    }, CONCURRENCY)
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
  log(`Ordering file has ${((total - missing) / total * 100)}% coverage.`)
  return sortedFiles
}

function getRelativePath(fileSet: FileSet, p: string) {
  const relative = p.substring(ensureEndSlash(fileSet.src).length)

  if (path.sep === "\\") {
    if (relative.startsWith("\\")) {
      // windows problem: double backslash, the above substring call removes root path with a single slash, so here can me some leftovers
      return relative.substring(1)
    }
  }

  return relative
}

function getTargetPath(fileSet: FileSet, p: string, to: string) {
  if (p === fileSet.src) {
    return to
  }
  return p.replace(ensureEndSlash(fileSet.src), ensureEndSlash(to))
}