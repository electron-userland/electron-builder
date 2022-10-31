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

  // sort files to minimize file change (i.e. asar file is not changed dramatically on small change)
  async pack(fileSets: Array<ResolvedFileSet>, packager: PlatformPackager<any>) {
    // console.error('fileSets', JSON.stringify(fileSets))
    if (this.options.ordering != null) {
      // ordering doesn't support transformed files, but ordering is not used functionality - wait user report to fix it
      await order(fileSets[0].files, this.options.ordering, fileSets[0].src)
    }
    await mkdir(path.dirname(this.outFile), { recursive: true })

    // const unpackedFileIndexMap = new Map<ResolvedFileSet, Set<number>>()
    // for (const fileSet of fileSets) {
    //   unpackedFileIndexMap.set(fileSet, await this.createPackageFromFiles(fileSet, packager.info))
    // }
    // await this.writeAsarFile(fileSets, unpackedFileIndexMap)
    // await this.writeAsarFile2(fileSets, unpackedFileIndexMap, packager)
    await this.pack2(fileSets, packager.info)
  }

  private async pack2(fileSets: ResolvedFileSet[], packager: Packager) {
    const taskManager = new AsyncTaskManager(packager.cancellationToken)
    const unpackedDirs = new Set<string>()
    const files1 = new Set<string>()
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
        await mkdir(path.dirname(dest), {recursive: true})
        taskManager.addTask(copyFileOrData(this.fileCopier, undefined, file, dest, await fs.stat(file)))
        if (taskManager.tasks.length > MAX_FILE_REQUESTS) {
          await taskManager.awaitTasks()
        }
        files1.add(dest)
      }
      await taskManager.awaitTasks()
    }
    console.log('unpackedDirs', unpackedDirs)
    const files2 = new Set<string>()
    for await (const fileSet of fileSets) {
      // console.log('purge?', fileSet.src, fileSet.files)
      for (const file of fileSet.files) {
        const p = path.dirname(file)
        const r = path.relative(this.src, p)

        const f = path.relative(this.src, file)
        const shouldntUnpack = !unpackedDirs.has(r) && !unpackedDirs.has(f)
        if (shouldntUnpack) {
          files2.add(f)
        } else {
          // if (p.includes('node-mac-permissions')) {
          // console.log('pr', file, r)
          // }
        }
      }
    }
    const unpack = Array.from(unpackedDirs).map(fileOrDir => {
      let p = fileOrDir
      if (statSync(p).isDirectory()) {
        p = path.join(fileOrDir, '**/*')
      }
      return path.isAbsolute(fileOrDir) ? p : path.join(this.rootForAppFilesWithoutAsar, p)
    }).join(',')
    const options: CreateOptions = {
      unpack: "{" + unpack + "}",
      // unpack: '**/node_modules/electron-updater/**/*',
      // unpack: path.join(this.rootForAppFilesWithoutAsar, 'node_modules/electron-updater/**/*'),
      // unpackDir: this.unpackedDest,
      ordering: this.options.ordering || undefined,
      // pattern: `/out/**/*`,
      // globOptions: {
      //   root: this.src,
      // }
    }
    // console.log('options', options)
    // const allFiles = Array.from(files2).map(file => {
    //   const srcRelative = path.relative(this.src, file)
    //   const dest = path.join(this.rootForAppFilesWithoutAsar, srcRelative)
    //   return dest
    // })
    // console.log('allFiles', allFiles)
    // console.log('files2', Array.from(new Set(files2.filter(f => f.destination.includes('node-mac-permissions')))))
    await createPackageFromFiles(this.rootForAppFilesWithoutAsar, this.outFile,
      // allFiles,
      Array.from(files1),
      undefined,
      options
    )
    // for await (const file of Array.from(files1)) {
    //   await rm(path.join(this.rootForAppFilesWithoutAsar, file))
    // }
    rmSync(this.rootForAppFilesWithoutAsar, { recursive: true})
    // await createPackageWithOptions(this.unpackedDest, this.outFile, options)
    // for await (const file of unneededDirs) {
    //   // console.log(file)
    //   rmSync(file)
    // }
    // cleanEmptyFoldersRecursively(this.rootForAppFilesWithoutAsar)
    // cleanEmptyFoldersRecursively(this.unpackedDest)
  }

  private async createPackageFromFiles(fileSet: ResolvedFileSet, packager: Packager) {
    const metadata = fileSet.metadata
    // search auto unpacked dir
    const unpackedDirs = new Set<string>()

    if (this.options.smartUnpack !== false) {
      await detectUnpackedDirs(fileSet, unpackedDirs, this.unpackedDest, this.rootForAppFilesWithoutAsar)
    }

    // console.log('unpackedDirs', unpackedDirs.entries())

    const dirToCreateForUnpackedFiles = new Set<string>(unpackedDirs)

    const correctDirNodeUnpackedFlag = async (filePathInArchive: string, dirNode: Node) => {
      for (const dir of unpackedDirs) {
        if (filePathInArchive.length > dir.length + 2 && filePathInArchive[dir.length] === path.sep && filePathInArchive.startsWith(dir)) {
          dirNode.unpacked = true
          unpackedDirs.add(filePathInArchive)
          // not all dirs marked as unpacked after first iteration - because node module dir can be marked as unpacked after processing node module dir content
          // e.g. node-notifier/example/advanced.js processed, but only on process vendor/terminal-notifier.app module will be marked as unpacked
          await mkdir(path.join(this.unpackedDest, filePathInArchive), { recursive: true })
          break
        }
      }
    }

    const transformedFiles = fileSet.transformedFiles
    const taskManager = new AsyncTaskManager(packager.cancellationToken)

    let currentDirNode: Node | null = null
    let currentDirPath: string | null = null

    const unpackedFileIndexSet = new Set<number>()

    for (let i = 0, n = fileSet.files.length; i < n; i++) {
      const file = fileSet.files[i]
      const stat = metadata.get(file)
      if (stat == null) {
        continue
      }

      const pathInArchive = path.relative(this.rootForAppFilesWithoutAsar, getDestinationPath(file, fileSet))

      if (stat.isSymbolicLink()) {
        const s = stat as any
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
          } else {
            await correctDirNodeUnpackedFlag(fileParent, currentDirNode)
          }
        }
      }

      const dirNode = currentDirNode!
      const newData = transformedFiles == null ? undefined : transformedFiles.get(i)
      const isUnpacked = dirNode.unpacked || (this.unpackPattern != null && this.unpackPattern(file, stat))
      const integrity = newData === undefined ? await hashFile(file) : hashFileContents(newData)
      this.fs.addFileNode(file, dirNode, newData == undefined ? stat.size : Buffer.byteLength(newData), isUnpacked, stat, integrity)
      if (isUnpacked) {
        if (!dirNode.unpacked && !dirToCreateForUnpackedFiles.has(fileParent)) {
          dirToCreateForUnpackedFiles.add(fileParent)
          await mkdir(path.join(this.unpackedDest, fileParent), { recursive: true })
        }

        const unpackedFile = path.join(this.unpackedDest, pathInArchive)
        taskManager.addTask(copyFileOrData(this.fileCopier, newData, file, unpackedFile, stat))
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

  private async writeAsarFile2(fileSets: Array<ResolvedFileSet>, unpackedFileIndexMap: Map<ResolvedFileSet, Set<number>>, packager: PlatformPackager<any>): Promise<any> {
    let fileSetIndex = 0

    let files = fileSets[0].files
    let metadata = fileSets[0].metadata
    let transformedFiles = fileSets[0].transformedFiles
    let unpackedFileIndexSet = unpackedFileIndexMap.get(fileSets[0])!
    const unpackGlob: string[] = []
    const unneededDirs: string[] = []
    const w = async (index: number) => {
      while (true) {
        if (index >= files.length) {
          if (++fileSetIndex >= fileSets.length) {
            // writeStream.end()
            return
          } else {
            files = fileSets[fileSetIndex].files
            metadata = fileSets[fileSetIndex].metadata
            transformedFiles = fileSets[fileSetIndex].transformedFiles
            unpackedFileIndexSet = unpackedFileIndexMap.get(fileSets[fileSetIndex])!
            index = 0
          }
        }

        if (!unpackedFileIndexSet.has(index)) {
          break
        } else {
          const stat = metadata.get(files[index])
          if (stat != null && stat.isSymbolicLink()) {
            await new Promise(resolve => {
              console.log('symlink', (stat as any).linkRelativeToFile, (stat as any).pathInArchive)
              symlink((stat as any).linkRelativeToFile, path.join(this.unpackedDest, (stat as any).pathInArchive), resolve)
            })
            unpackGlob.push((stat as any).pathInArchive)
            await w(index + 1)
            return
          }
        }
        index++
      }

      const data = transformedFiles == null ? null : transformedFiles.get(index)
      const file = files[index]
      const destination = fileSets[fileSetIndex].destination
      const src = fileSets[fileSetIndex].src
      const subpath = path.relative(src, file)
      const destPath = path.join(destination, subpath)
      unneededDirs.push(destPath)
      await mkdir(path.dirname(destPath), { recursive: true })
      await copyFileOrData(this.fileCopier, data, file, destPath, metadata.get(file)!)
      await w(index + 1)
    }

    await w(0)
    const unpackedDirs = new Set<string>()

    const files2 = new Set<string>()
    // unpackedFileIndexMap.forEach((value, key)=> {
    //   if (key.destination.includes(this.rootForAppFilesWithoutAsar)) {
    //     files2.push(key)
    //   }
    // })
    for await (const fileSet of fileSets) {
      if (this.options.smartUnpack !== false) {
        await detectUnpackedDirs(fileSet, unpackedDirs, this.unpackedDest, this.rootForAppFilesWithoutAsar)
      }
      for await (const file of fileSet.files) {
        if (this.unpackPattern != null && this.unpackPattern(file, await fs.stat(file))) {
          unpackedDirs.add(path.relative(this.src, file))
        }
      }
    }
    console.log('unpackedDirs', unpackedDirs)
    for await (const fileSet of fileSets) {
      // console.log('purge?', fileSet.src, fileSet.files)
      for (const file of fileSet.files) {
        const p = path.dirname(file)
        const r = path.relative(this.src, p)

        const f = path.relative(this.src, file)
        const shouldntUnpack = !unpackedDirs.has(r) && !unpackedDirs.has(f)
        if (shouldntUnpack) {
          files2.add(f)
        } else {
          // if (p.includes('node-mac-permissions')) {
          console.log('pr', file, r)
          // }
        }
      }
    }
    const options: CreateOptions = {
      unpack: '(' + Array.from(unpackedDirs).join(')/!(') + ')',
      unpackDir: this.unpackedDest,
      ordering: this.options.ordering || undefined,
      // pattern: `/out/**/*`,
      // globOptions: {
      //   root: this.rootForAppFilesWithoutAsar,
      // }
    }
    console.log('files2', Array.from(new Set(files2)))
    // console.log('files2', Array.from(new Set(files2.filter(f => f.destination.includes('node-mac-permissions')))))
    await createPackageFromFiles(this.rootForAppFilesWithoutAsar, this.outFile,
      // Array.from(files2),
      fileSets.flatMap(f => f.files).map(f => path.join(this.rootForAppFilesWithoutAsar, path.relative(this.src, f))),
      undefined,
      options
    )
    cleanEmptyFoldersRecursively(this.unpackedDest)
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
      let unpackedFileIndexSet = unpackedFileIndexMap.get(fileSets[0])!
      const w = (index: number) => {
        while (true) {
          if (index >= files.length) {
            if (++fileSetIndex >= fileSets.length) {
              writeStream.end()
              return
            } else {
              files = fileSets[fileSetIndex].files
              metadata = fileSets[fileSetIndex].metadata
              transformedFiles = fileSets[fileSetIndex].transformedFiles
              unpackedFileIndexSet = unpackedFileIndexMap.get(fileSets[fileSetIndex])!
              index = 0
            }
          }

          if (!unpackedFileIndexSet.has(index)) {
            break
          } else {
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
        if (stat != null && stat.size < 2 * 1024 * 1024) {
          readFile(file)
            .then(it => {
              writeStream.write(it, () => w(index + 1))
            })
            .catch(e => reject(`Cannot read file ${file}: ${e.stack || e}`))
        } else {
          const readStream = createReadStream(file)
          readStream.on("error", reject)
          readStream.once("end", () => w(index + 1))
          readStream.on("open", () => {
            readStream.pipe(writeStream, {
              end: false,
            })
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
  log.info({ coverage: ((total - missing) / total) * 100 }, "ordering files in ASAR archive")
  return sortedFiles
}

function copyFileOrData(fileCopier: FileCopier, data: string | Buffer | undefined | null, source: string, destination: string, stats: Stats) {
  if (data == null) {
    return fileCopier.copy(source, destination, stats)
  } else {
    return writeFile(destination, data)
  }
}

function cleanEmptyFoldersRecursively(folder: string) {
  const isDir = fs.statSync(folder).isDirectory()
  if (!isDir) {
    return
  }
  let files = fs.readdirSync(folder)
  if (files.length > 0) {
    files.forEach(function (file) {
      const fullPath = path.join(folder, file)
      cleanEmptyFoldersRecursively(fullPath)
    })

    // re-evaluate files; after deleting subfolder, we may have parent folder empty now
    files = fs.readdirSync(folder)
  }

  if (files.length == 0) {
    fs.rmdirSync(folder)
    return
  }
}

// async function crawlFilesystem (crawled: any[]) {
//   const metadata: any = {}
//   const results = await Promise.all(crawled.map(async filename => [filename, await determineFileType(filename)]))
//   const links: any[] = []
//   const filenames = results.map(([filename, type]) => {
//     if (type) {
//       metadata[filename] = type
//       if (type.type === 'link') links.push(filename)
//     }
//     return filename
//   }).filter((filename) => {
//     // Newer glob can return files inside symlinked directories, to avoid
//     // those appearing in archives we need to manually exclude theme here
//     const exactLinkIndex = links.findIndex(link => filename === link)
//     return links.every((link, index) => {
//       if (index === exactLinkIndex) return true
//       return !filename.startsWith(link)
//     })
//   })
//   return [filenames, metadata]
// }

// const glob = promisify(require('glob'))

// async function determineFileType (filename: string) {
//   const stat = await fs.lstat(filename)
//   if (stat.isFile()) {
//     return { type: 'file', stat }
//   } else if (stat.isDirectory()) {
//     return { type: 'directory', stat }
//   } else if (stat.isSymbolicLink()) {
//     return { type: 'link', stat }
//   }
//   return undefined
// }