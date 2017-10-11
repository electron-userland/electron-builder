import BluebirdPromise from "bluebird-lst"
import { hashFile } from "builder-util"
import { PackageFileInfo } from "builder-util-runtime"
import { BlockMap, SIGNATURE_HEADER_SIZE } from "builder-util-runtime/out/blockMapApi"
import { appendFile, stat, writeFile } from "fs-extra-p"
import { safeDump } from "js-yaml"
import { Archive } from "./Archive"
import { SevenZArchiveEntry } from "./SevenZArchiveEntry"
import { SevenZFile } from "./SevenZFile"
import { ContentDefinedChunker } from "./ContentDefinedChunker"

const deflateRaw: any = BluebirdPromise.promisify(require("zlib").deflateRaw)

/*
Approach like AppX block map, but with one difference - block not compressed individually, instead, the whole file is compressed using LZMA compression.
See (Package File in the developer readme) about compression. So, delta will be not ideal (because compressed data can change not only actually changed block in the file, but others,
and we don't set even dict size and default 64M is used), but full package size will be still relative small and will save initial download time/costs.
 */

// reduce dict size to avoid large block invalidation on change
export async function createDifferentialPackage(archiveFile: string): Promise<PackageFileInfo> {
  // compute block map using compressed file data
  const sevenZFile = new SevenZFile(archiveFile)
  try {
    const archive = await sevenZFile.read()
    const blockMap = await computeBlockMap(sevenZFile)
    sevenZFile.close()

    const blockMapDataString = safeDump(blockMap)
    if (process.env.DEBUG_BLOCKMAP) {
      await writeFile(archiveFile + ".blockMap.yml", blockMapDataString)
    }
    const blockMapFileData = await deflateRaw(blockMapDataString, {level: 9})
    await appendFile(archiveFile, blockMapFileData)
    const packageFileInfo = await createPackageFileInfo(archiveFile)
    packageFileInfo.headerSize = archive.headerSize
    packageFileInfo.blockMapSize = blockMapFileData.length
    packageFileInfo.blockMapData = blockMapDataString
    return packageFileInfo
  }
  catch (e) {
    sevenZFile.close()
    throw e
  }
}

export async function createPackageFileInfo(file: string): Promise<PackageFileInfo> {
  return {
    file,
    size: (await stat(file)).size,
    sha512: await hashFile(file),
  }
}

class BlockMapBuilder {
  private currentFolderIndex = -1

  constructor(private readonly archive: Archive) {
  }

  // noinspection BadExpressionStatementJS
  buildFile(file: SevenZArchiveEntry) {
    const archive = this.archive

    const folderIndex = file.blockIndex
    if (folderIndex < 0) {
      // empty file
      file.dataStart = 0
      file.dataEnd = 0
      return
    }

    if (folderIndex === this.currentFolderIndex) {
      throw new Error("Solid not supported")
    }

    this.currentFolderIndex = folderIndex

    const folder = archive.folders[folderIndex]
    const firstPackStreamIndex = folder.firstPackedStreamIndex
    const folderOffset = SIGNATURE_HEADER_SIZE + archive.packPosition + archive.streamMap.packStreamOffsets[firstPackStreamIndex]

    let size = 0
    for (let i = 0; i < folder.packedStreams.length; i++) {
      size += archive.packedSizes[firstPackStreamIndex + i]
    }

    file.dataStart = folderOffset
    file.dataEnd = folderOffset + size
    // console.log(`${file.name} ${size}, ${folder.totalInputStreams}`)
  }
}

export async function computeBlockMap(sevenZFile: SevenZFile): Promise<BlockMap> {
  const archive = sevenZFile.archive
  const builder = new BlockMapBuilder(archive)

  const files: Array<SevenZArchiveEntry> = []
  for (const file of archive.files) {
    if (!file.isDirectory) {
      builder.buildFile(file)
      // do not add empty files
      if (file.dataStart !== file.dataEnd) {
        files.push(file)
      }
    }
  }

  // just to be sure that file data really doesn't have gap and grouped one by one
  for (let i = 0; i < (files.length - 1); i++) {
    if (files[i].dataEnd !== files[i + 1].dataStart) {
      throw new Error("Must be no gap")
    }
  }

  const stats: Array<string> = []
  const blocks = await BluebirdPromise.map(files, async entry => {
    const chunker = new ContentDefinedChunker()
    const blocks = await chunker.computeChunks(sevenZFile.fd, entry.dataStart, entry.dataEnd, entry.name)

    if (process.env.DEBUG_BLOCKMAP) {
      stats.push(getStat(blocks.sizes, entry.name))
    }

    return {
      name: entry.name.replace(/\\/g, "/"),
      offset: entry.dataStart,
      size: entry.dataEnd - entry.dataStart,
      ...blocks,
    }
  }, {concurrency: 2})

  if (process.env.DEBUG_BLOCKMAP) {
    let duplicate = 0
    let savedSize = 0
    // noinspection JSMismatchedCollectionQueryUpdate
    const checksums: Array<string> = []
    // noinspection JSMismatchedCollectionQueryUpdate
    const sizes: Array<number> = []
    const index = new Map<string, number>()
    for (const file of blocks) {
      for (let i = 0; i < file.checksums.length; i++) {
        const checksum = file.checksums[i]
        const size = file.sizes[i]
        if (index.has(checksum)) {
          duplicate++
          savedSize += size
        }
        else {
          index.set(checksum, checksums.length)
          checksums.push(checksum)
          sizes.push(size)
        }
      }
    }

    console.log(stats.join("\n"))
    console.log(`duplicates: ${duplicate}, saved: ${savedSize}`)
  }

  return {
    version: "2",
    files: blocks,
  }
}

function getStat(sizes: Array<number>, name: string) {
  const sortedSizes = sizes.slice().sort((a, b) => a - b)
  const middle = Math.floor(sortedSizes.length / 2)
  const isEven = sortedSizes.length % 2 === 0
  const median = isEven ? (sortedSizes[middle] + sortedSizes[middle - 1]) / 2 : sortedSizes[middle]
  return `${sizes.length} chunks generated for ${name} (min: ${sortedSizes[0]}, max: ${sortedSizes[sortedSizes.length - 1]}, median: ${median})`
}