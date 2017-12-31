import BluebirdPromise from "bluebird-lst"
import { close, fstat, open, read } from "fs-extra-p"

export const BLOCK_MAP_FILE_NAME = "_blockMap.blockmap"

export interface FileChunks {
  checksums: Array<string>
  sizes: Array<number>
}

export interface BlockMap {
  version: "1" | "2"
  files: Array<BlockMapFile>
}

export interface BlockMapFile extends FileChunks {
  name: string
  offset: number
}

export async function readEmbeddedBlockMapData(file: string) {
  const fd = await open(file, "r")
  try {
    const fileSize = (await fstat(fd)).size
    const sizeBuffer = Buffer.allocUnsafe(4)
    await read(fd, sizeBuffer, 0, sizeBuffer.length, fileSize - sizeBuffer.length)

    const dataBuffer = Buffer.allocUnsafe(sizeBuffer.readUInt32BE(0))
    await read(fd, dataBuffer, 0, dataBuffer.length, fileSize - sizeBuffer.length - dataBuffer.length)
    await close(fd)

    const inflateRaw: any = BluebirdPromise.promisify(require("zlib").inflateRaw)
    return (await inflateRaw(dataBuffer)).toString()
  }
  catch (e) {
    await close(fd)
    throw e
  }
}