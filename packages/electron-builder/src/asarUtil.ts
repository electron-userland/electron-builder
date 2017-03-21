import BluebirdPromise from "bluebird-lst"
import { AsarOptions } from "electron-builder-core"
import { debug } from "electron-builder-util"
import { CONCURRENCY, FileCopier, Filter, MAX_FILE_REQUESTS, statOrNull, walk } from "electron-builder-util/out/fs"
import { log } from "electron-builder-util/out/log"
import { createReadStream, createWriteStream, ensureDir, readFile, readlink, stat, Stats, writeFile } from "fs-extra-p"
import * as path from "path"
import { AsarFilesystem, Node, readAsar } from "./asar"
import { FileTransformer } from "./fileTransformer"

const isBinaryFile: any = BluebirdPromise.promisify(require("isbinaryfile"))
const pickle = require ("chromium-pickle-js")

const NODE_MODULES_PATTERN = `${path.sep}node_modules${path.sep}`

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

interface UnpackedFileTask {
  stats: Stats
  src?: string
  data?: string
  destination: string
}

function writeUnpackedFiles(filesToUnpack: Array<UnpackedFileTask>, fileCopier: FileCopier): Promise<any> {
  return BluebirdPromise.map(filesToUnpack, it => {
    if (it.data == null) {
      return fileCopier.copy(it.src!, it.destination, it.stats)
    }
    else {
      return writeFile(it.destination, it.data)
    }
  })
}

export class AsarPackager {
  private readonly fs = new AsarFilesystem(this.src)
  private readonly outFile: string

  constructor(private readonly src: string, destination: string, private readonly options: AsarOptions, private readonly unpackPattern: Filter | null) {
    this.outFile = path.join(destination, "app.asar")
  }

  // sort files to minimize file change (i.e. asar file is not changed dramatically on small change)
  async pack(filter: Filter, transformer: ((path: string) => any) | null) {
    const metadata = new Map<string, Stats>()
    const files = await walk(this.src, filter, (file, fileStat) => {
      metadata.set(file, fileStat)
      if (fileStat.isSymbolicLink()) {
        return readlink(file)
          .then((linkTarget): any => {
            // http://unix.stackexchange.com/questions/105637/is-symlinks-target-relative-to-the-destinations-parent-directory-and-if-so-wh
            const resolved = path.resolve(path.dirname(file), linkTarget)
            const link = path.relative(this.src, linkTarget)
            if (link.startsWith("..")) {
              // outside of project, linked module (https://github.com/electron-userland/electron-builder/issues/675)
              return stat(resolved)
                .then(targetFileStat => {
                  metadata.set(file, targetFileStat)
                  return targetFileStat
                })
            }
            else {
              (<any>fileStat).relativeLink = link
            }
            return null
          })
      }
      return null
    })

    await this.createPackageFromFiles(this.options.ordering == null ? files : await this.order(files), metadata, transformer)
  }

  async detectUnpackedDirs(files: Array<string>, metadata: Map<string, Stats>, autoUnpackDirs: Set<string>, unpackedDest: string) {
    const dirToCreate = new Map<string, Array<string>>()

    /* tslint:disable:rule1 prefer-const */
    for (let i = 0, n = files.length; i < n; i++) {
      const file = files[i]
      const index = file.lastIndexOf(NODE_MODULES_PATTERN)
      if (index < 0) {
        continue
      }

      const nextSlashIndex = file.indexOf(path.sep, index + NODE_MODULES_PATTERN.length + 1)
      if (nextSlashIndex < 0) {
        continue
      }

      if (!metadata.get(file)!.isFile()) {
        continue
      }

      const nodeModuleDir = file.substring(0, nextSlashIndex)
      if (autoUnpackDirs.has(nodeModuleDir)) {
        const fileParent = path.dirname(file)
        if (fileParent !== nodeModuleDir && !autoUnpackDirs.has(fileParent)) {
          autoUnpackDirs.add(fileParent)
          addValue(dirToCreate, path.relative(this.src, nodeModuleDir), path.relative(nodeModuleDir, fileParent))
        }
        continue
      }

      const ext = path.extname(file)
      let shouldUnpack = false
      if (ext === ".dll" || ext === ".exe") {
        shouldUnpack = true
      }
      else if (ext === "") {
        shouldUnpack = await isBinaryFile(file)
      }

      if (!shouldUnpack) {
        continue
      }

      debug(`${path.relative(this.src, nodeModuleDir)} is not packed into asar archive - contains executable code`)

      let fileParent = path.dirname(file)

      // create parent dir to be able to copy file later without directory existence check
      addValue(dirToCreate, path.relative(this.src, nodeModuleDir), path.relative(nodeModuleDir, fileParent))

      while (fileParent !== nodeModuleDir) {
        autoUnpackDirs.add(fileParent)
        fileParent = path.dirname(fileParent)
      }
      autoUnpackDirs.add(nodeModuleDir)
    }
    
    if (dirToCreate.size > 0) {
      // child directories should be not created asynchronously - parent directories should be created first
      await BluebirdPromise.map(dirToCreate.keys(), async (it) => {
        const base = path.join(unpackedDest, it)
        await ensureDir(base)
        await BluebirdPromise.each(dirToCreate.get(it)!, it => ensureDir(path.join(base, it)))
      }, CONCURRENCY)
    }
  }

  private async createPackageFromFiles(files: Array<string>, metadata: Map<string, Stats>, transformer: FileTransformer | null) {
    // search auto unpacked dir
    const unpackedDirs = new Set<string>()
    const unpackedDest = `${this.outFile}.unpacked`
    await ensureDir(path.dirname(this.outFile))

    if (this.options.smartUnpack !== false) {
      await this.detectUnpackedDirs(files, metadata, unpackedDirs, unpackedDest)
    }

    const dirToCreateForUnpackedFiles = new Set<string>(unpackedDirs)
    
    const transformedFiles = transformer == null ? new Array(files.length) : await BluebirdPromise.map(files, it => it.includes("/node_modules/") || it.includes("/bower_components/") || !metadata.get(it)!.isFile() ? null : transformer(it), CONCURRENCY)
    const filesToUnpack: Array<UnpackedFileTask> = []
    const fileCopier = new FileCopier()
    /* tslint:disable:rule1 prefer-const */
    for (let i = 0, n = files.length; i < n; i++) {
      const file = files[i]
      const stat = metadata.get(file)!
      if (stat.isFile()) {
        const fileParent = path.dirname(file)
        const dirNode = this.fs.getOrCreateNode(fileParent)
        
        const newData = transformedFiles == null ? null : transformedFiles[i]
        const node = this.fs.getOrCreateNode(file)
        node.size = newData == null ? stat.size : Buffer.byteLength(newData)
        if (dirNode.unpacked || (this.unpackPattern != null && this.unpackPattern(file, stat))) {
          node.unpacked = true
          if (newData != null) {
            transformedFiles[i] = null
          }

          if (!dirNode.unpacked && !dirToCreateForUnpackedFiles.has(fileParent)) {
            dirToCreateForUnpackedFiles.add(fileParent)
            await ensureDir(fileParent.replace(this.src, unpackedDest))
          }

          const unpackedFile = file.replace(this.src, unpackedDest)
          filesToUnpack.push(newData == null ? {src: file, destination: unpackedFile, stats: stat} : {destination: unpackedFile, data: newData, stats: stat})
          if (filesToUnpack.length > MAX_FILE_REQUESTS) {
            await writeUnpackedFiles(filesToUnpack, fileCopier)
            filesToUnpack.length = 0
          }
        }
        else {
          if (newData == null) {
            transformedFiles[i] = true
          }
          
          this.fs.insertFileNode(node, stat, file)
        }
      }
      else if (stat.isDirectory()) {
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
              await ensureDir(file.replace(this.src, unpackedDest))
              break
            }
          }
        }
        this.fs.insertDirectory(file, unpacked)
      }
      else if (stat.isSymbolicLink()) {
        this.fs.getOrCreateNode(file).link = (<any>stat).relativeLink
      }
    }

    if (filesToUnpack.length > 0) {
      await writeUnpackedFiles(filesToUnpack, fileCopier)
    }
    
    await this.writeAsarFile(files, transformedFiles)
  }

  private writeAsarFile(files: Array<string>, transformedFiles: Array<string | Buffer | null | true>): Promise<any> {
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

      const w = (index: number) => {
        let data
        while (index < files.length && (data = transformedFiles[index++]) == null) {
        }
        
        if (index >= files.length) {
          writeStream.end()
          return
        }

        const file = files[index - 1]
        if (data !== true && data != null) {
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

  private async order(filenames: Array<string>) {
    const orderingFiles = (await readFile(this.options.ordering!, "utf8")).split("\n").map(line => {
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
      let str = this.src
      for (const pathComponent of pathComponents) {
        str = path.join(str, pathComponent)
        ordering.push(str)
      }
    }

    const filenamesSorted: Array<string> = []
    let missing = 0
    const total = filenames.length
    for (const file of ordering) {
      if (!filenamesSorted.includes(file) && filenames.includes(file)) {
        filenamesSorted.push(file)
      }
    }
    for (const file of filenames) {
      if (!filenamesSorted.includes(file)) {
        filenamesSorted.push(file)
        missing += 1
      }
    }
    log(`Ordering file has ${((total - missing) / total * 100)}% coverage.`)
    return filenamesSorted
  }
}

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
