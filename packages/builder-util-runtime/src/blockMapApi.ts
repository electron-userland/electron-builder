export const BLOCK_MAP_FILE_NAME = "_blockMap.yml"
export const SIGNATURE_HEADER_SIZE = 12 /* signature + 2 bytes version + 4 bytes CRC */ + 20

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
  size: number
}