import { AsarFileInfo, listPackage, statFile, AsarOptions } from "asar-electron-builder"
import { statOrNull } from "./util/util"
import { lstat, readdir, readFile, mkdirp, Stats, createWriteStream, copy, createReadStream } from "fs-extra-p"
import { Promise as BluebirdPromise } from "bluebird"
import * as path from "path"
import pathSorter = require("path-sort")
import { log } from "./util/log"
import { Minimatch } from "minimatch"

const isBinaryFile: any = BluebirdPromise.promisify(require("isbinaryfile"))
const pickle = require ("chromium-pickle-js")
const Filesystem = require("asar-electron-builder/lib/filesystem")

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./util/awaiter")

const concurrency = {concurrency: 50}
const NODE_MODULES_PATTERN = path.sep + "node_modules" + path.sep

function walk(dirPath: string, consumer: (file: string, stat: Stats) => void, filter: (file: string) => boolean, addRootToResult?: boolean): BluebirdPromise<Array<string>> {
  return readdir(dirPath)
    .then(names => {
      return BluebirdPromise.map(names, name => {
        const filePath = dirPath + path.sep + name
        if (!filter(filePath)) {
          return <any>null
        }

        return lstat(filePath)
          .then((stat): any => {
            consumer(filePath, stat)
            if (stat.isDirectory()) {
              return walk(filePath, consumer, filter, true)
            }
            return filePath
          })
      }, concurrency)
    })
    .then(list => {
      list.sort((a, b) => {
        // files before directories
        if (Array.isArray(a) && Array.isArray(b)) {
          return 0
        }
        else if (a == null || Array.isArray(a)) {
          return 1
        }
        else if (b == null || Array.isArray(b)) {
          return -1
        }
        else {
          return a.localeCompare(b)
        }
      })

      const result: Array<string> = addRootToResult ? [dirPath] : []
      for (let item of list) {
        if (item != null) {
          if (Array.isArray(item)) {
            result.push.apply(result, item)
          }
          else {
            result.push(item)
          }
        }
      }
      return result
    })
}

export async function createAsarArchive(src: string, resourcesPath: string, options: AsarOptions, filter: (file: string) => boolean): Promise<any> {
  const metadata = new Map<string, Stats>()
  const files = await walk(src, (it, stat) => {
    metadata.set(it, stat)
  }, filter)

  // sort files to minimize file change (i.e. asar file is not changed dramatically on small change)
  await createPackageFromFiles(src, path.join(resourcesPath, "app.asar"), options.ordering == null ? files : await order(src, files, options), metadata, options)
}

function isUnpackDir(path: string, pattern: Minimatch, rawPattern: string): boolean {
  return path.indexOf(rawPattern) === 0 || pattern.match(path)
}

async function order(src: string, filenames: Array<string>, options: any) {
  const orderingFiles = (await readFile(options.ordering, "utf8")).split("\n").map(function (line) {
    if (line.indexOf(':') !== -1) {
      line = line.split(':').pop()!
    }
    line = line.trim()
    if (line[0] === '/') {
      line = line.slice(1)
    }
    return line
  })

  const ordering: Array<string> = []
  for (let file of orderingFiles) {
    let pathComponents = file.split(path.sep)
    let str = src
    for (let pathComponent of pathComponents) {
      str = path.join(str, pathComponent)
      ordering.push(str)
    }
  }

  const filenamesSorted: Array<string> = []
  let missing = 0
  const total = filenames.length
  for (let file of ordering) {
    if (!filenamesSorted.includes(file) && filenames.includes(file)) {
      filenamesSorted.push(file)
    }
  }
  for (let file of filenames) {
    if (!filenamesSorted.includes(file)) {
      filenamesSorted.push(file)
      missing += 1;
    }
  }
  log(`Ordering file has ${((total - missing) / total * 100)}% coverage.`)
  return filenamesSorted
}

async function createPackageFromFiles(src: string, dest: string, files: Array<string>, metadata: Map<string, Stats>, options: any) {
  // search auto unpacked dir
  const autoUnpackDirs = new Set<string>()
  if (options.smartUnpack !== false) {
    for (let file of files) {
      const index = file.lastIndexOf(NODE_MODULES_PATTERN)
      if (index < 0) {
        continue
      }

      const nextSlashIndex = file.indexOf(path.sep, index + NODE_MODULES_PATTERN.length + 1)
      if (nextSlashIndex < 0) {
        continue
      }

      const nodeModuleDir = file.substring(0, nextSlashIndex)
      if (autoUnpackDirs.has(nodeModuleDir) || !metadata.get(file)!.isFile()) {
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

      log(`${path.relative(src, nodeModuleDir)} is not packed into asar archive - contains executable code`)
      autoUnpackDirs.add(nodeModuleDir)
    }
  }

  const unpackDir = options.unpackDir == null ? null : new Minimatch(options.unpackDir)
  const unpack = options.unpack == null ? null : new Minimatch(options.unpack, {
    matchBase: true
  })

  await mkdirp(path.dirname(dest))

  const unpackedDest = `${dest}.unpacked`
  const toPack: Array<string> = []
  const filesystem = new Filesystem(src)
  const copyPromises: Array<Promise<any>> = []
  for (let file of files) {
    const stat = metadata.get(file)!
    if (stat.isFile()) {
      const dir = path.dirname(file)

      let shouldUnpack = unpack != null && unpack.match(file)
      if (!shouldUnpack) {
        shouldUnpack = autoUnpackDirs.has(dir) || (unpackDir != null && isUnpackDir(path.relative(src, dir), unpackDir, options.unpackDir))
      }

      if (shouldUnpack) {
        copyPromises.push(copy(file, path.join(unpackedDest, path.relative(src, file))))
        // limit concurrency
        if (copyPromises.length > 50) {
          await BluebirdPromise.all(copyPromises)
          copyPromises.length = 0
        }
      }
      else {
        toPack.push(file)
      }

      filesystem.insertFile(file, shouldUnpack, stat)
    }
    else if (stat.isDirectory()) {
      let unpacked = autoUnpackDirs.has(file) || (unpackDir != null && isUnpackDir(path.relative(src, file), unpackDir, options.unpackDir))
      if (!unpacked) {
        for (let d of autoUnpackDirs) {
          if (file.length > (d.length + 2) && file[d.length] === path.sep && file.startsWith(d)) {
            unpacked = true
            autoUnpackDirs.add(file)
            break
          }
        }
      }
      filesystem.insertDirectory(file, unpacked)
    }
    else if (stat.isSymbolicLink()) {
      filesystem.insertLink(file, stat)
    }
  }

  await BluebirdPromise.all(copyPromises)

  const headerPickle = pickle.createEmpty()
  headerPickle.writeString(JSON.stringify(filesystem.header))
  const headerBuf = headerPickle.toBuffer()

  const sizePickle = pickle.createEmpty()
  sizePickle.writeUInt32(headerBuf.length)
  const sizeBuf = sizePickle.toBuffer()

  const out = createWriteStream(dest)
  await new BluebirdPromise((resolve, rejected) => {
    out.on("error", rejected)
    out.write(sizeBuf)

    function w(list: Array<any>, index: number) {
      if (list.length === index) {
        out.end()
        resolve()
        return
      }

      const stream = createReadStream(list[index])
      stream.on("error", rejected)
      stream.on("end", () => {
        w(list, index + 1)
      })
      stream.pipe(out, {
        end: false
      })
    }

    out.write(headerBuf, () => {
      w(toPack, 0)
    })
  })
}

export async function checkFileInPackage(asarFile: string, relativeFile: string) {
  let stat: AsarFileInfo | null
  try {
    stat = statFile(asarFile, relativeFile)
  }
  catch (e) {
    const fileStat = await statOrNull(asarFile)
    if (fileStat == null) {
      throw new Error(`File "${asarFile}" does not exist. Seems like a wrong configuration.`)
    }

    try {
      listPackage(asarFile)
    }
    catch (e) {
      throw new Error(`File "${asarFile}" is corrupted: ${e}`)
    }

    // asar throws error on access to undefined object (info.link)
    stat = null
  }

  if (stat == null) {
    throw new Error(`Application entry file "${relativeFile}" in the "${asarFile}" does not exist. Seems like a wrong configuration.`)
  }
  if (stat.size === 0) {
    throw new Error(`Application entry file "${relativeFile}" in the "${asarFile}" is corrupted: size 0`)
  }
}