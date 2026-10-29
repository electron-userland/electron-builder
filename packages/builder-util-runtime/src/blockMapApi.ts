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

/**
 * Largest block map an updater accepts, whatever the size of the file it describes (whole downloads, the size a v3 header declares,
 * and the decompressed size of a v2 map): a 2 GB installer at 1 KiB blocks needs ~22 MB, so this leaves ample room while keeping a
 * corrupt or hostile map from allocating gigabytes.
 */
export const MAX_BLOCK_MAP_SIZE = 128 * 1024 * 1024

/**
 * Block map bytes allowed per KiB of the described file. The densest maps electron-builder writes are v3 maps of a stored asar
 * (`STORED_MEMBER_CHUNKER_V3`, 512 B minimum blocks): 10 B per record plus ~2 B of group entry per block, ~25 B per KiB at
 * worst; a v2 map costs ~34 B of JSON per block, ~9 B per KiB at its finest chunker (4 KiB minimum blocks). 64 B leaves more
 * than twice the worst case.
 */
const BLOCK_MAP_BYTES_PER_KIB = 64
/**
 * Fixed allowance on top of the per-KiB bound: the header and regions, the small 7z header regions (256 B minimum blocks), and
 * blocks cut shorter than their chunker's minimum (at region edges and, in v3 maps, at every packed file of a stored asar) — ~100k extra v3 records or ~30k extra v2 entries.
 */
const BLOCK_MAP_SIZE_ALLOWANCE = 1024 * 1024

/**
 * The largest block map (decoded: the JSON of a v2 map, the binary v3 map) accepted for a file of `fileSize` bytes, or
 * MAX_BLOCK_MAP_SIZE when the size is not known. A map past it is rejected before it is decompressed or allocated, so a gzip
 * bomb or a header declaring huge tables cannot exhaust the memory of the updater; the update is then downloaded in full.
 */
export function blockMapSizeLimit(fileSize: number | null | undefined): number {
  if (fileSize == null || !Number.isSafeInteger(fileSize) || fileSize < 0) {
    return MAX_BLOCK_MAP_SIZE
  }
  return Math.min(MAX_BLOCK_MAP_SIZE, BLOCK_MAP_SIZE_ALLOWANCE + Math.ceil(fileSize / 1024) * BLOCK_MAP_BYTES_PER_KIB)
}
