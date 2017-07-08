import BluebirdPromise from "bluebird-lst"
import { debug, log } from "electron-builder-util"
import { CONCURRENCY, FileCopier, Filter, MAX_FILE_REQUESTS, statOrNull, walk } from "electron-builder-util/out/fs"
import { createReadStream, createWriteStream, ensureDir, readFile, Stats, writeFile } from "fs-extra-p"
import * as path from "path"
import { AsarFilesystem, Node, readAsar } from "../asar"
import { createElectronCompilerHost } from "../fileTransformer"
import { AsarOptions } from "../metadata"
import { Packager } from "../packager"
import { PlatformPackager } from "../platformPackager"
import { AppFileCopierHelper, AppFileWalker } from "./AppFileWalker"
import { AsyncTaskManager } from "./asyncTaskManager"

const isBinaryFile: any = BluebirdPromise.promisify(require("isbinaryfile"))
const pickle = require ("chromium-pickle-js")

const NODE_MODULES_PATTERN = `${path.sep}node_modules${path.sep}`
const BOWER_COMPONENTS_PATTERN = `${path.sep}bower_components${path.sep}`

/** @internal */
export const ELECTRON_COMPILE_SHIM_FILENAME = "__shim.js"

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

export function copyFileOrData(fileCopier: FileCopier, data: string | Buffer | undefined | null, src: string, destination: string, stats: Stats) {
  if (data == null) {
    return fileCopier.copy(src, destination, stats)
  }
  else {
    return writeFile(destination, data)
  }
}

/** @internal */
export class AsarPackager {
  private readonly fs = new AsarFilesystem(this.src)
  private readonly outFile: string
  
  private transformedFiles: Array<string | Buffer | true | null>
  private metadata: Map<string, Stats>

  private electronCompileCache: string | null = null

  constructor(private readonly src: string, destination: string, private readonly options: AsarOptions, private readonly unpackPattern: Filter | null) {
    this.outFile = path.join(destination, "app.asar")
  }

  // sort files to minimize file change (i.e. asar file is not changed dramatically on small change)
  async pack(isElectronCompile: boolean, packager: PlatformPackager<any>, fileWalker: AppFileWalker, fileCopierHelper: AppFileCopierHelper) {
    let files: Array<string> = await fileCopierHelper.collect(fileWalker)
    this.metadata = fileWalker.metadata
    this.transformedFiles = fileCopierHelper.transformedFiles

    // transform before electron-compile to avoid filtering (cache files in any case should be not transformed)
    if (isElectronCompile) {
      files = await this.compileUsingElectronCompile(files, packager)
    }
    
    await this.createPackageFromFiles(this.options.ordering == null ? files : await this.order(files), packager.info)
  }

  async compileUsingElectronCompile(files: Array<string>, packager: PlatformPackager<any>): Promise<Array<string>> {
    log("Compiling using electron-compile")
    
    const metadata = this.metadata
    this.electronCompileCache = await packager.getTempFile("electron-compile-cache")
    const cacheDir = path.join(this.electronCompileCache, ".cache")
    // clear and create cache dir
    await ensureDir(cacheDir)
    const compilerHost = await createElectronCompilerHost(this.src, cacheDir)
    const nextSlashIndex = this.src.length + 1
    // pre-compute electron-compile to cache dir - we need to process only subdirectories, not direct files of app dir
    await BluebirdPromise.map(files, file => {
      if (file.includes(NODE_MODULES_PATTERN) || file.includes(BOWER_COMPONENTS_PATTERN)
        || !file.includes(path.sep, nextSlashIndex) // ignore not root files
        || !metadata.get(file)!.isFile()) {
        return null
      }
      return compilerHost.compile(file)
        .then((it: any) => null)
    }, CONCURRENCY)

    await compilerHost.saveConfiguration()
    
    const cacheFiles = await walk(cacheDir, (file, stat) => !file.startsWith("."), {
      consume: (file, fileStat) => {
        this.metadata.set(file, fileStat)
        return null
      }
    })
    
    // add shim
    const shimPath = `${this.src}/${ELECTRON_COMPILE_SHIM_FILENAME}`
    cacheFiles.push(shimPath)
    metadata.set(shimPath, <any>{isFile: () => true, isDirectory: () => false})
    
    this.transformedFiles = (new Array(cacheFiles.length)).concat(this.transformedFiles)
    
    this.transformedFiles[cacheFiles.length - 1] = `
'use strict';
require('electron-compile').init(__dirname, require('path').resolve(__dirname, '${packager.info.metadata.main || "index"}'), true);
`
    // cache files should be first (better IO)
    return cacheFiles.concat(files)
  }

  async detectUnpackedDirs(files: Array<string>, autoUnpackDirs: Set<string>, unpackedDest: string) {
    const dirToCreate = new Map<string, Array<string>>()
    const metadata = this.metadata
    for (let i = 0, n = files.length; i < n; i++) {
      const file = files[i]
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
          addValue(dirToCreate, this.getRelativePath(packageDir), path.relative(packageDir, fileParent))
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
        debug(`${this.getRelativePath(packageDir)} is not packed into asar archive - contains executable code`)
      }

      let fileParent = path.dirname(file)

      // create parent dir to be able to copy file later without directory existence check
      addValue(dirToCreate, this.getRelativePath(packageDir), path.relative(packageDir, fileParent))

      while (fileParent !== packageDir) {
        autoUnpackDirs.add(fileParent)
        fileParent = path.dirname(fileParent)
      }
      autoUnpackDirs.add(packageDir)
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

  private getTargetPath(p: string, to: string) {
    if (this.electronCompileCache != null && p.startsWith(this.electronCompileCache)) {
      return this.electronCompileCache.replace(this.electronCompileCache, to)
    }
    return p.replace(this.src, to)
  }

  getRelativePath(p: string) {
    if (this.electronCompileCache != null && p.startsWith(this.electronCompileCache)) {
      return path.relative(this.electronCompileCache, p)
    }
    return path.relative(this.src, p)
  }

  private async createPackageFromFiles(files: Array<string>, packager: Packager) {
    const metadata = this.metadata
    // search auto unpacked dir
    const unpackedDirs = new Set<string>()
    const unpackedDest = `${this.outFile}.unpacked`
    await ensureDir(path.dirname(this.outFile))

    if (this.options.smartUnpack !== false) {
      await this.detectUnpackedDirs(files, unpackedDirs, unpackedDest)
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
            await ensureDir(this.getTargetPath(file, unpackedDest))
            break
          }
        }
      }
    }
    
    const transformedFiles = this.transformedFiles
    const taskManager = new AsyncTaskManager(packager.cancellationToken)
    const fileCopier = new FileCopier()

    let currentDirNode: Node | null = null
    let currentDirPath: string | null = null

    for (let i = 0, n = files.length; i < n; i++) {
      const file = files[i]
      const stat = metadata.get(file)
      if (stat != null && stat.isFile()) {
        const fileParent = path.dirname(file)

        if (currentDirPath !== fileParent) {
          currentDirPath = fileParent
          currentDirNode = this.fs.getOrCreateNode(this.getRelativePath(fileParent))
          await isDirNodeUnpacked(fileParent, currentDirNode)
        }

        const dirNode = currentDirNode!
        const newData = transformedFiles == null ? null : <string | Buffer>transformedFiles[i]
        const isUnpacked = dirNode.unpacked || (this.unpackPattern != null && this.unpackPattern(file, stat))
        this.fs.addFileNode(file, dirNode, newData == null ? stat.size : Buffer.byteLength(<any>newData), isUnpacked, stat)
        if (isUnpacked) {
          if (newData != null) {
            transformedFiles[i] = null
          }

          if (!dirNode.unpacked && !dirToCreateForUnpackedFiles.has(fileParent)) {
            dirToCreateForUnpackedFiles.add(fileParent)
            await ensureDir(this.getTargetPath(fileParent, unpackedDest))
          }

          const unpackedFile = this.getTargetPath(file, unpackedDest)
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
              await ensureDir(this.getTargetPath(file, unpackedDest))
              break
            }
          }
        }
        this.fs.insertDirectory(this.getRelativePath(file), unpacked)
      }
      else if (stat.isSymbolicLink()) {
        this.fs.getOrCreateNode(this.getRelativePath(file)).link = (<any>stat).relativeLink
      }
    }

    if (taskManager.tasks.length > 0) {
      await taskManager.awaitTasks()
    }
    
    await this.writeAsarFile(files)
  }

  private writeAsarFile(files: Array<string>): Promise<any> {
    const headerPickle = pickle.createEmpty()
    headerPickle.writeString(JSON.stringify(this.fs.header))
    const headerBuf = headerPickle.toBuffer()

    const sizePickle = pickle.createEmpty()
    sizePickle.writeUInt32(headerBuf.length)
    const sizeBuf = sizePickle.toBuffer()

    const transformedFiles = this.transformedFiles
    const writeStream = createWriteStream(this.outFile)
    return new BluebirdPromise((resolve, reject) => {
      writeStream.on("error", reject)
      writeStream.on("close", resolve)
      writeStream.write(sizeBuf)

      const w = (index: number) => {
        let data
        while (true) {
          if (index >= files.length) {
            writeStream.end()
            return
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
      for (const pathComponent of pathComponents) {
        ordering.push(path.join(this.src, pathComponent))
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
