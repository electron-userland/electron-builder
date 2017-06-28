import BluebirdPromise from "bluebird-lst"
import { debug, log } from "electron-builder-util"
import { CONCURRENCY, FileCopier, FileTransformer, Filter, MAX_FILE_REQUESTS, statOrNull, walk } from "electron-builder-util/out/fs"
import { createReadStream, createWriteStream, ensureDir, readFile, readlink, stat, Stats, writeFile } from "fs-extra-p"
import * as path from "path"
import { AsarFilesystem, Node, readAsar } from "../asar"
import { createElectronCompilerHost } from "../fileTransformer"
import { AsarOptions } from "../metadata"
import { PlatformPackager } from "../platformPackager"
import { dependencies } from "./packageDependencies"

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

interface UnpackedFileTask {
  stats: Stats
  src?: string
  data?: string | Buffer
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

/** @internal */
export class AsarPackager {
  private readonly fs = new AsarFilesystem(this.src)
  private readonly outFile: string
  
  private transformedFiles: Array<string | Buffer | true | null>
  private readonly metadata = new Map<string, Stats>()

  private electronCompileCache: string | null = null

  constructor(private readonly src: string, destination: string, private readonly options: AsarOptions, private readonly unpackPattern: Filter | null, private readonly transformer: FileTransformer) {
    this.outFile = path.join(destination, "app.asar")
  }

  // sort files to minimize file change (i.e. asar file is not changed dramatically on small change)
  async pack(filter: Filter, isElectronCompile: boolean, packager: PlatformPackager<any>) {
    const metadata = this.metadata
    const nodeModulesSystemDependentSuffix = `${path.sep}node_modules`
    let files = await walk(this.src, filter, (file, fileStat, parent, extraIgnoredFiles, siblingNames) => {
      metadata.set(file, fileStat)

      // https://github.com/electron-userland/electron-builder/issues/1539
      // but do not filter if we inside node_modules dir
      if (fileStat.isDirectory() && file.endsWith(nodeModulesSystemDependentSuffix) && !parent.includes("node_modules") && siblingNames.includes("package.json")) {
        return dependencies(parent, extraIgnoredFiles)
          .then(it => {
            if (debug.enabled) {
              debug(`Dev or extraneous dependencies in the ${parent}: ${Array.from(extraIgnoredFiles).filter(it => it.startsWith(file)).map(it => path.relative(file, it)).join(", ")}`)
            }
            return null
          })
      }

      if (!fileStat.isSymbolicLink()) {
        return null
      }

      return readlink(file)
        .then((linkTarget): any => {
          // http://unix.stackexchange.com/questions/105637/is-symlinks-target-relative-to-the-destinations-parent-directory-and-if-so-wh
          const resolved = path.resolve(path.dirname(file), linkTarget)
          const link = this.getRelativePath(linkTarget)
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
    })
    
    // transform before electron-compile to avoid filtering (cache files in any case should be not transformed)
    const transformer = this.transformer
    this.transformedFiles = await BluebirdPromise.map(files, it => metadata.get(it)!.isFile() ? transformer(it) : null, CONCURRENCY)
    
    if (isElectronCompile) {
      files = await this.compileUsingElectronCompile(files, packager)
    }
    
    await this.createPackageFromFiles(this.options.ordering == null ? files : await this.order(files))
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
    
    const cacheFiles = await walk(cacheDir, (file, stat) => !file.startsWith("."), (file, fileStat) => {
      this.metadata.set(file, fileStat)
      return null
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
    /* tslint:disable:rule1 prefer-const */
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

      debug(`${this.getRelativePath(packageDir)} is not packed into asar archive - contains executable code`)

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

  private getRelativePath(p: string) {
    if (this.electronCompileCache != null && p.startsWith(this.electronCompileCache)) {
      return path.relative(this.electronCompileCache, p)
    }
    return path.relative(this.src, p)
  }

  private async createPackageFromFiles(files: Array<string>) {
    const metadata = this.metadata
    // search auto unpacked dir
    const unpackedDirs = new Set<string>()
    const unpackedDest = `${this.outFile}.unpacked`
    await ensureDir(path.dirname(this.outFile))

    if (this.options.smartUnpack !== false) {
      await this.detectUnpackedDirs(files, unpackedDirs, unpackedDest)
    }

    const dirToCreateForUnpackedFiles = new Set<string>(unpackedDirs)
    
    const transformedFiles = this.transformedFiles
    const filesToUnpack: Array<UnpackedFileTask> = []
    const fileCopier = new FileCopier()
    /* tslint:disable:rule1 prefer-const */
    for (let i = 0, n = files.length; i < n; i++) {
      const file = files[i]
      const stat = metadata.get(file)!
      const relativePath = this.getRelativePath(file)
      if (stat.isFile()) {
        const fileParent = path.dirname(file)
        const dirNode = this.fs.getOrCreateNode(this.getRelativePath(fileParent))
        
        const newData = transformedFiles == null ? null : <string | Buffer>transformedFiles[i]
        const node = this.fs.getOrCreateNode(relativePath)
        node.size = newData == null ? stat.size : Buffer.byteLength(<any>newData)
        if (dirNode.unpacked || (this.unpackPattern != null && this.unpackPattern(file, stat))) {
          node.unpacked = true
          if (newData != null) {
            transformedFiles[i] = null
          }

          if (!dirNode.unpacked && !dirToCreateForUnpackedFiles.has(fileParent)) {
            dirToCreateForUnpackedFiles.add(fileParent)
            await ensureDir(this.getTargetPath(fileParent, unpackedDest))
          }

          const unpackedFile = this.getTargetPath(file, unpackedDest)
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
              await ensureDir(this.getTargetPath(file, unpackedDest))
              break
            }
          }
        }
        this.fs.insertDirectory(relativePath, unpacked)
      }
      else if (stat.isSymbolicLink()) {
        this.fs.getOrCreateNode(relativePath).link = (<any>stat).relativeLink
      }
    }

    if (filesToUnpack.length > 0) {
      await writeUnpackedFiles(filesToUnpack, fileCopier)
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
