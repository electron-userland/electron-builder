export const BLOCK_MAP_FILE_NAME = "_blockMap.yml"
export const SIGNATURE_HEADER_SIZE = 12 /* signature + 2 bytes version + 4 bytes CRC */ + 20

export interface BlockMap {
  blockSize: number
  hashMethod: "sha256" | "md5"

  compressionLevel: 9 | 1

  files: Array<BlockMapFile>
}

export interface BlockMapFile {
  name: string
  offset: number
  size: number

  // size of block 64K, last block size `size % (64 * 1024)`
  blocks: Array<string>
}