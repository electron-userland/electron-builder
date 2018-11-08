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