import BluebirdPromise from "bluebird-lst"
import { AsyncTaskManager, debug, log } from "builder-util"
import { CONCURRENCY, FileCopier, Filter, MAX_FILE_REQUESTS, statOrNull } from "builder-util/out/fs"
import { createReadStream, createWriteStream, ensureDir, readFile, Stats, writeFile } from "fs-extra-p"
import * as path from "path"
import { AsarOptions } from "../index"
import { Packager } from "../packager"
import { PlatformPackager } from "../platformPackager"
import { getDestinationPath } from "../util/appFileCopier"
import { NODE_MODULES_PATTERN, ResolvedFileSet } from "../util/AppFileCopierHelper"
import { AsarFilesystem, Node, readAsar } from "./asar"

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

  constructor(private readonly src: string, private readonly destination: string, private readonly options: AsarOptions, private readonly unpackPattern: Filter | null) {
    this.outFile = path.join(destination, "app.asar")
  }

  // sort files to minimize file change (i.e. asar file is not changed dramatically on small change)
  async pack(fileSets: Array<ResolvedFileSet>, packager: PlatformPackager<any>) {
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

  private async createPackageFromFiles(fileSet: ResolvedFileSet, packager: Packager) {
    const metadata = fileSet.metadata
    // search auto unpacked dir
    const unpackedDirs = new Set<string>()
    const unpackedDest = `${this.outFile}.unpacked`
    const rootForAppFilesWithoutAsar = path.join(this.destination, "app")

    if (this.options.smartUnpack !== false) {
      await detectUnpackedDirs(fileSet, unpackedDirs, unpackedDest, rootForAppFilesWithoutAsar)
    }

    const dirToCreateForUnpackedFiles = new Set<string>(unpackedDirs)

    const isDirNodeUnpacked = async (filePathInArchive: string, dirNode: Node) => {
      if (dirNode.unpacked) {
        return
      }

      if (unpackedDirs.has(filePathInArchive)) {
        dirNode.unpacked = true
      }
      else {
        for (const dir of unpackedDirs) {
          if (filePathInArchive.length > (dir.length + 2) && filePathInArchive[dir.length] === path.sep && filePathInArchive.startsWith(dir)) {
            dirNode.unpacked = true
            unpackedDirs.add(filePathInArchive)
            // not all dirs marked as unpacked after first iteration - because node module dir can be marked as unpacked after processing node module dir content
            // e.g. node-notifier/example/advanced.js processed, but only on process vendor/terminal-notifier.app module will be marked as unpacked
            await ensureDir(path.join(unpackedDest, filePathInArchive))
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
      const pathInArchive = path.relative(rootForAppFilesWithoutAsar, getDestinationPath(file, fileSet))
      if (stat != null && stat.isFile()) {
        let fileParent = path.dirname(pathInArchive)
        if (fileParent === ".") {
          fileParent = ""
        }

        if (currentDirPath !== fileParent) {
          currentDirPath = fileParent
          currentDirNode = this.fs.getOrCreateNode(fileParent)
          // do not check for root
          if (fileParent !== "") {
            await isDirNodeUnpacked(fileParent, currentDirNode)
          }
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
            await ensureDir(path.join(unpackedDest, fileParent))
          }

          const unpackedFile = path.join(unpackedDest, pathInArchive)
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
        if (unpackedDirs.has(pathInArchive)) {
          unpacked = true
        }
        else {
          for (const dir of unpackedDirs) {
            if (pathInArchive.length > (dir.length + 2) && pathInArchive[dir.length] === path.sep && pathInArchive.startsWith(dir)) {
              unpacked = true
              unpackedDirs.add(pathInArchive)
              // not all dirs marked as unpacked after first iteration - because node module dir can be marked as unpacked after processing node module dir content
              // e.g. node-notifier/example/advanced.js processed, but only on process vendor/terminal-notifier.app module will be marked as unpacked
              await ensureDir(path.join(unpackedDest, pathInArchive))
              break
            }
          }
        }
        this.fs.insertDirectory(pathInArchive, unpacked)
      }
      else if (stat.isSymbolicLink()) {
        this.fs.getOrCreateNode(pathInArchive).link = (stat as any).relativeLink
      }
    }

    if (taskManager.tasks.length > 0) {
      await taskManager.awaitTasks()
    }
  }

  private writeAsarFile(fileSets: Array<ResolvedFileSet>): Promise<any> {
    return new BluebirdPromise((resolve, reject) => {
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
              metadata = fileSets[fileSetIndex].metadata
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

        // https://github.com/yarnpkg/yarn/pull/3539
        const stat = metadata.get(file)
        if (stat != null && stat.size < (4 * 1024 * 1024)) {
          readFile(file)
            .then(it => {
              writeStream.write(it, () => w(index))
            })
            .catch(reject)
        }
        else {
          const readStream = createReadStream(file)
          readStream.on("error", reject)
          readStream.once("end", () => w(index))
          readStream.pipe(writeStream, {
            end: false
          })
        }
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

async function detectUnpackedDirs(fileSet: ResolvedFileSet, autoUnpackDirs: Set<string>, unpackedDest: string, rootForAppFilesWithoutAsar: string) {
  const dirToCreate = new Map<string, Array<string>>()
  const metadata = fileSet.metadata

  function addParents(child: string, root: string) {
    child = path.dirname(child)
    if (autoUnpackDirs.has(child)) {
      return
    }

    do {
      autoUnpackDirs.add(child)
      const p = path.dirname(child)
      // create parent dir to be able to copy file later without directory existence check
      addValue(dirToCreate, p, path.basename(child))

      if (child === root || p === root || autoUnpackDirs.has(p)) {
        break
      }
      child = p
    }
    while (true)

    autoUnpackDirs.add(root)
  }

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
    const packageDirPathInArchive = path.relative(rootForAppFilesWithoutAsar, getDestinationPath(packageDir, fileSet))
    const pathInArchive = path.relative(rootForAppFilesWithoutAsar, getDestinationPath(file, fileSet))
    if (autoUnpackDirs.has(packageDirPathInArchive)) {
      // if package dir is unpacked, any file also unpacked
      addParents(pathInArchive, packageDirPathInArchive)
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
      debug(`${pathInArchive} is not packed into asar archive - contains executable code`)
    }

    addParents(pathInArchive, packageDirPathInArchive)
  }

  if (dirToCreate.size > 0) {
    await ensureDir(unpackedDest + path.sep + "node_modules")
    // child directories should be not created asynchronously - parent directories should be created first
    await BluebirdPromise.map(dirToCreate.keys(), async parentDir => {
      const base = unpackedDest + path.sep + parentDir
      await ensureDir(base)
      await BluebirdPromise.each(dirToCreate.get(parentDir)!, (it): any => {
        if (dirToCreate.has(parentDir + path.sep + it)) {
          // already created
          return null
        }
        else {
          return ensureDir(base + path.sep + it)
        }
      })
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