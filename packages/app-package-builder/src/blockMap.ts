import BluebirdPromise from "bluebird-lst"
import { hashFile } from "builder-util"
import { PackageFileInfo } from "builder-util-runtime"
import { BlockMap, BlockMapFile, SIGNATURE_HEADER_SIZE } from "builder-util-runtime/out/blockMapApi"
import { close, open, stat, write, writeFile } from "fs-extra-p"
import { Archive } from "./Archive"
import { ContentDefinedChunker } from "./ContentDefinedChunker"
import { SevenZArchiveEntry } from "./SevenZArchiveEntry"
import { SevenZFile } from "./SevenZFile"

const gzip: any = BluebirdPromise.promisify(require("zlib").gzip)

/*
Approach like AppX block map, but with one difference - block not compressed individually, instead, the whole file is compressed using LZMA compression.
See (Package File in the developer readme) about compression. So, delta will be not ideal (because compressed data can change not only actually changed block in the file, but others,
and we don't set even dict size and default 64M is used), but full package size will be still relative small and will save initial download time/costs.
 */
export async function createDifferentialPackage(archiveFile: string): Promise<PackageFileInfo> {
  const fd = await open(archiveFile, "a+")
  try {
    // compute block map using compressed file data
    const sevenZFile = new SevenZFile(fd)
    await sevenZFile.read()
    const blockMap = await computeBlockMap(sevenZFile)

    const blockMapFileData = await serializeBlockMap(blockMap, archiveFile)
    await write(fd, blockMapFileData, 0, blockMapFileData.length)
    await close(fd)

    const result = await createFileInfo(blockMapFileData, archiveFile, (await stat(archiveFile)).size)
    result.headerSize = sevenZFile.archive.headerSize
    return result
  }
  catch (e) {
    await close(fd)
    throw e
  }
}

async function serializeBlockMap(blockMap: BlockMap, file: string) {
  // lzma doesn't make a lof of sense (151 KB lzma vs 156 KB deflate) for small text file where most of the data are unique strings (encoded checksums)
  // protobuf size — BlockMap size: 153104, compressed: 151256 So, it means that it doesn't make sense - better to use deflate instead of complicating (another runtime dependency (google-protobuf), proto files and so on)
  // size encoding in a form where next value is a relative to previous doesn't make sense (zero savings in tests), since in our case next size can be less than previous (so, int will be negative and `-` symbol will be added)
  // sha2556 secure hash is not required, md5 collision-resistance is good for our purpose, secure hash algorithm not required, in any case sha512 checksum is checked for the whole file. And size of matched block is checked in addition to.
  const blockMapDataString = JSON.stringify(blockMap)
  const blockMapFileData: Buffer = await gzip(blockMapDataString, {level: 9, chunkSize: 1024 * 1024})

  if (process.env.DEBUG_BLOCKMAP) {
    const buffer = Buffer.from(blockMapDataString)
    await writeFile(`${file}.blockMap.json`, buffer)
    console.log(`BlockMap size: ${buffer.length}, compressed: ${blockMapFileData.length}`)
  }
  return blockMapFileData
}

async function createFileInfo(blockMapData: Buffer, file: string, fileSize: number): Promise<PackageFileInfo> {
  return {
    path: file,
    size: fileSize,
    blockMapSize: blockMapData.length,
    blockMapData,
    sha512: await hashFile(file),
  }
}

export async function createPackageFileInfo(file: string, blockMapSize: number): Promise<PackageFileInfo> {
  return {
    path: file,
    size: (await stat(file)).size,
    blockMapSize,
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

export interface SubFileDescriptor {
  name: string

  dataStart: number
  dataEnd: number
}

export async function computeBlockMap(sevenZFile: SevenZFile): Promise<BlockMap> {
  const archive = sevenZFile.archive
  const builder = new BlockMapBuilder(archive)

  const files: Array<SubFileDescriptor> = []
  for (const file of archive.files) {
    if (!file.isDirectory) {
      builder.buildFile(file)
      // do not add empty files
      if (file.dataStart !== file.dataEnd) {
        files.push(file)
      }
    }
  }

  return await doComputeBlockMap(files, sevenZFile.fd)
}

async function doComputeBlockMap(files: Array<SubFileDescriptor>, fd: number): Promise<BlockMap> {
  // just to be sure that file data really doesn't have gap and grouped one by one
  for (let i = 0; i < (files.length - 1); i++) {
    if (files[i].dataEnd !== files[i + 1].dataStart) {
      throw new Error("Must be no gap")
    }
  }

  const stats: Array<string> = []
  const blocks = await BluebirdPromise.map(files, async (file): Promise<BlockMapFile> => {
    const chunker = new ContentDefinedChunker()
    const blocks = await chunker.computeChunks(fd, file.dataStart, file.dataEnd, file.name)

    if (process.env.DEBUG_BLOCKMAP) {
      stats.push(getStat(blocks.sizes, file.name))
    }

    return {
      name: file.name.replace(/\\/g, "/"),
      offset: file.dataStart,
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