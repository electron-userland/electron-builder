import BluebirdPromise from "bluebird-lst"
import { createHash } from "crypto"
import { read } from "fs-extra-p"
import { EntryDataRange, openZip } from "./nsis/zip"

async function computeBlocks(fd: number, range: EntryDataRange): Promise<Array<string>> {
  const chunkSize = 64 * 1024
  const buffer = Buffer.allocUnsafe(chunkSize)
  const blocks = []

  for (let offset = range.start; offset < range.end; offset += chunkSize) {
    const actualChunkSize = Math.min(range.end - offset, chunkSize)
    await read(fd, buffer, 0, actualChunkSize, offset)

    const hash = createHash("sha256")
    hash.update(actualChunkSize === chunkSize ? buffer : buffer.slice(0, actualChunkSize))
    blocks.push(hash.digest("base64"))
  }

  return blocks
}

export async function computeBlockMap(archiveFile: string, compressionMethod: "lzma", compressionLevel: 9 | 1): Promise<BlockMap> {
  const zip = await openZip(archiveFile)
  try {
    const entries = await zip.readEntries()
    const files = await BluebirdPromise.map(entries, async entry => {
      const blocks = await computeBlocks(zip.fd, await zip.getDataPosition(entry))
      return {
        name: (entry.fileName as string).replace(/\\/g, "/"),
        size: entry.compressedSize,
        blocks,
      }
    }, {concurrency: 8})
    return {
      blockSize: 64,
      hashMethod: "sha256",
      files,
      compressionMethod,
      compressionLevel,
    }
  }
  finally {
    await zip.close()
  }
}

export interface BlockMap {
  blockSize: number
  hashMethod: "sha256"

  // https://sourceforge.net/p/sevenzip/discussion/45798/thread/222c71f9/?limit=25
  compressionMethod: "lzma"
  compressionLevel: 9 | 1

  files: Array<BlockMapFile>
}

export interface BlockMapFile {
  name: string
  size: number

  // size of block 64K, last block size `size % (64 * 1024)`
  blocks: Array<string>
}