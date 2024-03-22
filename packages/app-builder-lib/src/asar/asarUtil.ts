import { AsyncTaskManager, log } from "builder-util"
import { FileCopier, Filter, MAX_FILE_REQUESTS } from "builder-util/out/fs"
import { symlink, createReadStream, createWriteStream, Stats } from "fs"
import { writeFile, readFile, mkdir } from "fs/promises"
import * as path from "path"
import { AsarOptions } from "../options/PlatformSpecificBuildOptions"
import { Packager } from "../packager"
import { PlatformPackager } from "../platformPackager"
import { ResolvedFileSet } from "../util/appFileCopier"
import { AsarFilesystem, Node } from "./asar"
import { hashFile, hashFileContents } from "./integrity"
import { detectUnpackedDirs } from "./unpackDetector"
import { NODE_MODULES_PATTERN } from "../fileTransformer"

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pickle = require("chromium-pickle-js")

function generateNewPath(filePath: string, destination: string): string {
  // Split the paths into parts
  const filePathParts: string[] = filePath.split(path.sep)
  const destinationParts: string[] = destination.split(path.sep)

  // Find all occurrences of 'node_modules' in both paths
  const nodeModulesIndicesFilePath: number[] = filePathParts.reduce((acc: number[], part: string, index: number) => {
    if (part === "node_modules") acc.push(index)
    return acc
  }, [])

  const nodeModulesIndicesDestination: number[] = destinationParts.reduce((acc: number[], part: string, index: number) => {
    if (part === "node_modules") acc.push(index)
    return acc
  }, [])

  // Calculate the target index for 'node_modules' in the destination path
  const targetNodeModulesIndex: number = nodeModulesIndicesDestination[nodeModulesIndicesFilePath.length - 1] || nodeModulesIndicesDestination.slice(-1)[0]

  // If 'node_modules' is not found in the file path or destination, return an error message
  if (nodeModulesIndicesFilePath.length === 0 || nodeModulesIndicesDestination.length === 0) {
    return 'Error: The specified paths do not contain "node_modules"'
  }

  // Reconstruct the path from the destination to the targeted 'node_modules'
  const basePath: string = destinationParts.slice(0, targetNodeModulesIndex + 1).join(path.sep)

  // Append the part of the filePath after the last 'node_modules' to the basePath
  const newPath: string = path.join(basePath, ...filePathParts.slice(nodeModulesIndicesFilePath.slice(-1)[0] + 1))

  return newPath
}

function getDestinationPath(file: string, fileSet: ResolvedFileSet) {
  if (file === fileSet.src) {
    return fileSet.destination
  } else {
    const src = fileSet.src
    const dest = fileSet.destination
    if (file.length > src.length && file.startsWith(src) && file[src.length] === path.sep) {
      return (dest + file.substring(src.length)).replace(`${path.sep}.pnpm`, "")
    } else {
      // hoisted node_modules
      // not lastIndexOf, to ensure that nested module (top-level module depends on) copied to parent node_modules, not to top-level directory
      // project https://github.com/angexis/punchcontrol/commit/cf929aba55c40d0d8901c54df7945e1d001ce022
      let index = file.indexOf(NODE_MODULES_PATTERN)
      if (index < 0 && file.endsWith(`${path.sep}node_modules`)) {
        index = file.length - 13
      }
      if (index < 0) {
        throw new Error(`File "${file}" not under the source directory "${fileSet.src}"`)
      }
      return generateNewPath(file, dest).replace(`${path.sep}.pnpm`, "")
    }
  }
}

/** @internal */
export class AsarPackager {
  private readonly fs = new AsarFilesystem(this.src)
  private readonly outFile: string
  private readonly unpackedDest: string

  constructor(
    private readonly src: string,
    private readonly destination: string,
    private readonly options: AsarOptions,
    private readonly unpackPattern: Filter | null
  ) {
    this.outFile = path.join(destination, "app.asar")
    this.unpackedDest = `${this.outFile}.unpacked`
  }

  // sort files to minimize file change (i.e. asar file is not changed dramatically on small change)
  async pack(fileSets: Array<ResolvedFileSet>, packager: PlatformPackager<any>) {
    if (this.options.ordering != null) {
      // ordering doesn't support transformed files, but ordering is not used functionality - wait user report to fix it
      await order(fileSets[0].files, this.options.ordering, fileSets[0].src)
    }
    await mkdir(path.dirname(this.outFile), { recursive: true })
    const unpackedFileIndexMap = new Map<ResolvedFileSet, Set<number>>()
    const orderedFileSets = [
      // Write dependencies first to minimize offset changes to asar header
      ...fileSets.slice(1),

      // Finish with the app files that change most often
      fileSets[0],
    ].map(orderFileSet)

    for (const fileSet of orderedFileSets) {
      unpackedFileIndexMap.set(fileSet, await this.createPackageFromFiles(fileSet, packager.info))
    }
    await this.writeAsarFile(orderedFileSets, unpackedFileIndexMap)
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
      log.info({ dest: "dest" }, file)

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
            .catch((e: any) => reject(`Cannot read file ${file}: ${e.stack || e}`))
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

function orderFileSet(fileSet: ResolvedFileSet): ResolvedFileSet {
  const sortedFileEntries = Array.from(fileSet.files.entries())

  sortedFileEntries.sort(([, a], [, b]) => {
    if (a === b) {
      return 0
    }

    // Place addons last because their signature change
    const isAAddon = a.endsWith(".node")
    const isBAddon = b.endsWith(".node")
    if (isAAddon && !isBAddon) {
      return 1
    }
    if (isBAddon && !isAAddon) {
      return -1
    }

    // Otherwise order by name
    return a < b ? -1 : 1
  })

  let transformedFiles: Map<number, string | Buffer> | undefined
  if (fileSet.transformedFiles) {
    transformedFiles = new Map()

    const indexMap = new Map<number, number>()
    for (const [newIndex, [oldIndex]] of sortedFileEntries.entries()) {
      indexMap.set(oldIndex, newIndex)
    }

    for (const [oldIndex, value] of fileSet.transformedFiles) {
      const newIndex = indexMap.get(oldIndex)
      if (newIndex === undefined) {
        const file = fileSet.files[oldIndex]
        throw new Error(`Internal error: ${file} was lost while ordering asar`)
      }

      transformedFiles.set(newIndex, value)
    }
  }

  const { src, destination, metadata } = fileSet

  return {
    src,
    destination,
    metadata,
    files: sortedFileEntries.map(([, file]) => file),
    transformedFiles,
  }
}
