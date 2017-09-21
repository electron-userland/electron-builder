import BluebirdPromise from "bluebird-lst"
import { hashFile } from "builder-util"
import { PackageFileInfo } from "builder-util-runtime"
import { BlockMap, SIGNATURE_HEADER_SIZE } from "builder-util-runtime/out/blockMapApi"
import { createHash } from "crypto"
import { appendFile, read, stat } from "fs-extra-p"
import { safeDump } from "js-yaml"
import { Archive } from "./Archive"
import { SevenZArchiveEntry } from "./SevenZArchiveEntry"
import { SevenZFile } from "./SevenZFile"

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
    const blockMap = await computeBlockMap(sevenZFile, "lzma", (process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || "9") as any)
    sevenZFile.close()

    const blockMapDataString = safeDump(blockMap)
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

async function computeBlocks(fd: number, start: number, end: number): Promise<Array<string>> {
  const chunkSize = 64 * 1024
  const buffer = Buffer.allocUnsafe(chunkSize)
  const blocks = []

  for (let offset = start; offset < end; offset += chunkSize) {
    const actualChunkSize = Math.min(end - offset, chunkSize)
    await read(fd, buffer, 0, actualChunkSize, offset)

    const hash = createHash("md5")
    hash.update(actualChunkSize === chunkSize ? buffer : buffer.slice(0, actualChunkSize))
    // node-base91 doesn't make a lot of sense - 29KB vs 30KB Because for base64 string value in the yml never escaped, but node-base91 often escaped (single quotes) and it adds extra 2 symbols.
    // And in any case data stored as deflated in the package.
    blocks.push(hash.digest("base64"))
  }

  return blocks
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
      throw new Error("What does empty stream mean?")
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

export async function computeBlockMap(sevenZFile: SevenZFile, compressionMethod: "lzma", compressionLevel: 9 | 1): Promise<BlockMap> {
  const archive = sevenZFile.archive
  const builder = new BlockMapBuilder(archive)
  const entries = archive.files
  for (const file of entries) {
    if (!file.isDirectory) {
      builder.buildFile(file)
    }
  }

  const files = archive.files.filter(it => !it.isDirectory)
  // just to be sure that file data really doesn't have gap and grouped one by one
  for (let i = 0; i < (files.length - 1); i++) {
    if (files[i].dataEnd !== files[i + 1].dataStart) {
      throw new Error("Must be no gap")
    }
  }

  const blocks = await BluebirdPromise.map(files, async entry => {
    const blocks = await computeBlocks(sevenZFile.fd, entry.dataStart, entry.dataEnd)
    return {
      name: entry.name.replace(/\\/g, "/"),
      offset: entry.dataStart,
      size: entry.dataEnd - entry.dataStart,
      blocks,
    }
  }, {concurrency: 4})
  return {
    blockSize: 64,
    hashMethod: "md5",
    compressionMethod,
    compressionLevel,
    files: blocks,
  }
}