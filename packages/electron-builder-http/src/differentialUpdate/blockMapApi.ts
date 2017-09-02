export const BLOCK_MAP_FILE_NAME = "blockMap.yml"

export interface BlockMap {
  blockSize: number
  hashMethod: "sha256" | "md5"

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