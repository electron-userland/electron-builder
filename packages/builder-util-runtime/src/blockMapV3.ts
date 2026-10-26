import { blake2b } from "@noble/hashes/blake2.js"
import { BlockMap } from "./blockMapApi.js"

/**
 * Block map v3 — a range-fetchable, three-level binary block map (see the v3 spec in the PR that
 * introduced it). Little-endian, uncompressed, fixed-size tables, so an updater can fetch the header
 * and the small super-group table with one Range request, compare super hashes against its cached
 * previous map, fetch only the group entries of super-groups that changed, compare those, and finally
 * fetch only the records of the groups that changed.
 *
 *   header  (HEADER_FIXED_SIZE + regionCount × REGION_SIZE bytes)
 *   supers  (superCount × SUPER_SIZE):  { superHash u64, blockCount u32, groupCount u16, reserved u16 }
 *   groups  (groupCount × GROUP_SIZE):  { groupHash u64, byteLength u32, blockCount u16, reserved u16 }
 *   records (blockCount × RECORD_SIZE): { blockHash u64, size u16 }
 *
 * A block hash is the first 8 bytes of the blake2b-18 digest that v2 base64-encodes; a group hash is
 * the first 8 bytes of blake2b-18 over the group's concatenated records; a super hash is the same over
 * the super-group's concatenated group entries. Groups are content-defined on the block-hash stream (a
 * group ends when the low GROUP_MASK bits of a block hash are all set, subject to GROUP_MIN/GROUP_MAX
 * blocks) and super-groups are content-defined on the group-hash stream the same way; both are forced
 * closed at every region edge and at EOF, so an unchanged run of blocks yields identical groups and
 * super-groups wherever it sits. The cost of fetching a map that differs in a few places is therefore
 * O(changes × log n) instead of O(n): the super table, a super-group's worth of group entries and a
 * group's worth of records per changed spot.
 */

export const BLOCK_MAP_V3_MAGIC = "EBM3"
export const BLOCK_MAP_V3_VERSION = 2

/**
 * Whether `data` is a block map in this binary, range-fetchable format (the `blockmap: "v2"` format) rather than the gzipped JSON
 * block map (`"v1"`). Both are published as `<file>.blockmap`; the first bytes tell them apart.
 */
export function isBlockMapV3(data: Buffer): boolean {
  return data.length >= BLOCK_MAP_V3_MAGIC.length && data.toString("latin1", 0, BLOCK_MAP_V3_MAGIC.length) === BLOCK_MAP_V3_MAGIC
}

export const HASH_LEN = 8
export const SUPER_SIZE = 16
export const GROUP_SIZE = 16
export const RECORD_SIZE = 10
export const REGION_SIZE = 28
export const HEADER_FIXED_SIZE = 46

/** Content-defined grouping parameters (in blocks). */
export const GROUP_AVG = 32
export const GROUP_MASK = GROUP_AVG - 1
export const GROUP_MIN = 8
export const GROUP_MAX = 128

/** Content-defined super-grouping parameters (in groups). */
export const SUPER_AVG = 16
export const SUPER_MASK = SUPER_AVG - 1
export const SUPER_MIN = 4
export const SUPER_MAX = 64

export interface ChunkerParamsV3 {
  min: number
  avg: number
  max: number
}

export interface BlockMapV3Region extends ChunkerParamsV3 {
  offset: number
  size: number
}

export interface BlockMapV3Super {
  /** 8-byte hash of the super-group's group entries as a 16-char lowercase hex string */
  hash: string
  blockCount: number
  groupCount: number
}

export interface BlockMapV3Group {
  /** 8-byte hash as a 16-char lowercase hex string (avoids BigInt in hot paths) */
  hash: string
  byteLength: number
  blockCount: number
}

export interface BlockMapV3Record {
  /** 8-byte hash as a 16-char lowercase hex string */
  hash: string
  size: number
}

export interface BlockMapV3Header {
  version: number
  fileSize: number
  superCount: number
  groupCount: number
  blockCount: number
  /** byte offset of the super-group table (the group table and the records follow it) */
  headerLen: number
  defaultChunker: ChunkerParamsV3
  regions: Array<BlockMapV3Region>
}

export interface BlockMapV3 {
  header: BlockMapV3Header
  supers: Array<BlockMapV3Super>
  groups: Array<BlockMapV3Group>
  /** records of every block, in file order */
  records: Array<BlockMapV3Record>
}

/** Input block for the encoder: the full blake2b-18 digest (or at least its first 8 bytes) and the block size. */
export interface BlockInput {
  digest: Uint8Array
  size: number
  /** absolute offset of the block's first byte; used only to force group boundaries at region edges */
  offset: number
}

function hex8(bytes: Uint8Array, start = 0): string {
  let s = ""
  for (let i = start; i < start + HASH_LEN; i++) {
    s += bytes[i].toString(16).padStart(2, "0")
  }
  return s
}

function writeHex8(buf: Buffer, offset: number, hex: string): void {
  buf.write(hex, offset, HASH_LEN, "hex")
}

export function groupHashOfRecords(recordBytes: Uint8Array): string {
  return hex8(blake2b(recordBytes, { dkLen: 18 }))
}

export function superHashOfGroups(groupBytes: Uint8Array): string {
  return hex8(blake2b(groupBytes, { dkLen: 18 }))
}

export interface IndexRange {
  start: number
  /** exclusive */
  end: number
}

/**
 * Splits `blocks` (in file order) into content-defined groups. Boundaries are forced at every offset
 * in `forcedBoundaries` (region edges) and at the end.
 */
export function groupBlocks(blocks: Array<BlockInput>, forcedBoundaries: Set<number> = new Set()): Array<IndexRange> {
  const groups: Array<IndexRange> = []
  let start = 0
  for (let i = 0; i < blocks.length; i++) {
    const count = i - start + 1
    const next = blocks[i + 1]
    const forced = next == null || forcedBoundaries.has(next.offset)
    // the low GROUP_MASK bits of the last hash byte decide a content-defined cut
    const marker = (blocks[i].digest[HASH_LEN - 1] & GROUP_MASK) === GROUP_MASK
    if (forced || count >= GROUP_MAX || (count >= GROUP_MIN && marker)) {
      groups.push({ start, end: i + 1 })
      start = i + 1
    }
  }
  return groups
}

/**
 * Splits groups (in file order) into content-defined super-groups on the stream of group hashes.
 * `groupHashBytes[i]` is group i's 8-byte hash, `groupStartOffsets[i]` the absolute offset of its first
 * block; a boundary is forced before every group that starts at an offset in `forcedBoundaries`.
 */
export function groupSupers(groupHashBytes: Array<Uint8Array>, groupStartOffsets: Array<number>, forcedBoundaries: Set<number> = new Set()): Array<IndexRange> {
  const supers: Array<IndexRange> = []
  let start = 0
  for (let i = 0; i < groupHashBytes.length; i++) {
    const count = i - start + 1
    const forced = i + 1 >= groupHashBytes.length || forcedBoundaries.has(groupStartOffsets[i + 1])
    const marker = (groupHashBytes[i][HASH_LEN - 1] & SUPER_MASK) === SUPER_MASK
    if (forced || count >= SUPER_MAX || (count >= SUPER_MIN && marker)) {
      supers.push({ start, end: i + 1 })
      start = i + 1
    }
  }
  return supers
}

export interface EncodeOptions {
  fileSize: number
  defaultChunker: ChunkerParamsV3
  regions?: Array<BlockMapV3Region> | null
}

/** Serializes blocks (in file order) into a v3 block map buffer. */
export function encodeBlockMapV3(blocks: Array<BlockInput>, options: EncodeOptions): Buffer {
  const regions = options.regions ?? []
  const forced = new Set<number>()
  for (const region of regions) {
    forced.add(region.offset)
    forced.add(region.offset + region.size)
  }
  const groups = groupBlocks(blocks, forced)

  // records first: group hashes are hashes of record bytes, super hashes of group entry bytes
  const recordBytes = Buffer.alloc(blocks.length * RECORD_SIZE)
  let r = 0
  for (const block of blocks) {
    if (block.size > 0xffff) {
      throw new Error(`block map v3: block size ${block.size} exceeds the 16-bit record limit`)
    }
    recordBytes.set(block.digest.subarray(0, HASH_LEN), r)
    recordBytes.writeUInt16LE(block.size, r + HASH_LEN)
    r += RECORD_SIZE
  }

  const groupBytes = Buffer.alloc(groups.length * GROUP_SIZE)
  const groupHashBytes: Array<Uint8Array> = []
  const groupStartOffsets: Array<number> = []
  let g = 0
  for (const group of groups) {
    let byteLength = 0
    for (let i = group.start; i < group.end; i++) {
      byteLength += blocks[i].size
    }
    const digest = blake2b(recordBytes.subarray(group.start * RECORD_SIZE, group.end * RECORD_SIZE), { dkLen: 18 })
    groupBytes.set(digest.subarray(0, HASH_LEN), g)
    groupBytes.writeUInt32LE(byteLength, g + 8)
    groupBytes.writeUInt16LE(group.end - group.start, g + 12)
    groupBytes.writeUInt16LE(0, g + 14)
    groupHashBytes.push(digest.subarray(0, HASH_LEN))
    groupStartOffsets.push(blocks[group.start].offset)
    g += GROUP_SIZE
  }

  const supers = groupSupers(groupHashBytes, groupStartOffsets, forced)
  const superBytes = Buffer.alloc(supers.length * SUPER_SIZE)
  let s = 0
  for (const sup of supers) {
    let blockCount = 0
    for (let i = sup.start; i < sup.end; i++) {
      blockCount += groups[i].end - groups[i].start
    }
    writeHex8(superBytes, s, superHashOfGroups(groupBytes.subarray(sup.start * GROUP_SIZE, sup.end * GROUP_SIZE)))
    superBytes.writeUInt32LE(blockCount, s + 8)
    superBytes.writeUInt16LE(sup.end - sup.start, s + 12)
    superBytes.writeUInt16LE(0, s + 14)
    s += SUPER_SIZE
  }

  const headerLen = HEADER_FIXED_SIZE + regions.length * REGION_SIZE
  const header = Buffer.alloc(headerLen)
  header.write(BLOCK_MAP_V3_MAGIC, 0, 4, "latin1")
  header.writeUInt8(BLOCK_MAP_V3_VERSION, 4)
  header.writeUInt8(HASH_LEN, 5)
  header.writeUInt8(HASH_LEN, 6)
  header.writeUInt8(0, 7)
  header.writeBigUInt64LE(BigInt(options.fileSize), 8)
  header.writeUInt32LE(groups.length, 16)
  header.writeUInt32LE(blocks.length, 20)
  header.writeUInt32LE(headerLen, 24)
  header.writeUInt32LE(options.defaultChunker.min, 28)
  header.writeUInt32LE(options.defaultChunker.avg, 32)
  header.writeUInt32LE(options.defaultChunker.max, 36)
  header.writeUInt16LE(regions.length, 40)
  header.writeUInt32LE(supers.length, 42)
  let p = HEADER_FIXED_SIZE
  for (const region of regions) {
    header.writeBigUInt64LE(BigInt(region.offset), p)
    header.writeBigUInt64LE(BigInt(region.size), p + 8)
    header.writeUInt32LE(region.min, p + 16)
    header.writeUInt32LE(region.avg, p + 20)
    header.writeUInt32LE(region.max, p + 24)
    p += REGION_SIZE
  }
  return Buffer.concat([header, superBytes, groupBytes, recordBytes])
}

/** Parses the fixed header + regions. `buf` must hold at least HEADER_FIXED_SIZE bytes (and the regions). */
export function parseBlockMapV3Header(buf: Buffer): BlockMapV3Header {
  if (buf.length < HEADER_FIXED_SIZE || buf.toString("latin1", 0, 4) !== BLOCK_MAP_V3_MAGIC) {
    throw new Error("block map v3: bad magic")
  }
  const version = buf.readUInt8(4)
  if (version !== BLOCK_MAP_V3_VERSION) {
    throw new Error(`block map v3: unsupported version ${version}`)
  }
  if (buf.readUInt8(5) !== HASH_LEN || buf.readUInt8(6) !== HASH_LEN) {
    throw new Error("block map v3: unsupported hash length")
  }
  const regionCount = buf.readUInt16LE(40)
  const headerLen = buf.readUInt32LE(24)
  if (headerLen !== HEADER_FIXED_SIZE + regionCount * REGION_SIZE) {
    throw new Error("block map v3: inconsistent header length")
  }
  if (buf.length < headerLen) {
    throw new Error("block map v3: truncated header")
  }
  const regions: Array<BlockMapV3Region> = []
  let p = HEADER_FIXED_SIZE
  for (let i = 0; i < regionCount; i++) {
    regions.push({
      offset: Number(buf.readBigUInt64LE(p)),
      size: Number(buf.readBigUInt64LE(p + 8)),
      min: buf.readUInt32LE(p + 16),
      avg: buf.readUInt32LE(p + 20),
      max: buf.readUInt32LE(p + 24),
    })
    p += REGION_SIZE
  }
  const fileSize = Number(buf.readBigUInt64LE(8))
  const superCount = buf.readUInt32LE(42)
  const groupCount = buf.readUInt32LE(16)
  const blockCount = buf.readUInt32LE(20)
  // every block, group and super-group is non-empty, so the counts are bounded by the file size; checked before any table
  // size derived from them is allocated or requested
  if (blockCount > fileSize || groupCount > blockCount || superCount > groupCount) {
    throw new Error(`block map v3: inconsistent counts (fileSize ${fileSize}, blocks ${blockCount}, groups ${groupCount}, super-groups ${superCount})`)
  }
  return {
    version,
    fileSize,
    superCount,
    groupCount,
    blockCount,
    headerLen,
    defaultChunker: { min: buf.readUInt32LE(28), avg: buf.readUInt32LE(32), max: buf.readUInt32LE(36) },
    regions,
  }
}

/** Byte offset of the group table. */
export function groupTableStart(header: BlockMapV3Header): number {
  return header.headerLen + header.superCount * SUPER_SIZE
}

/** Byte offset of the records. */
export function recordsStart(header: BlockMapV3Header): number {
  return groupTableStart(header) + header.groupCount * GROUP_SIZE
}

/** Total size of the map file described by `header`. */
export function blockMapV3Size(header: BlockMapV3Header): number {
  return recordsStart(header) + header.blockCount * RECORD_SIZE
}

/** Parses the super-group table given the header and a buffer holding bytes [0, groupTableStart). */
export function parseBlockMapV3Supers(header: BlockMapV3Header, buf: Buffer): Array<BlockMapV3Super> {
  const end = groupTableStart(header)
  if (buf.length < end) {
    throw new Error("block map v3: truncated super-group table")
  }
  const supers: Array<BlockMapV3Super> = []
  for (let s = header.headerLen; s < end; s += SUPER_SIZE) {
    supers.push({ hash: hex8(buf, s), blockCount: buf.readUInt32LE(s + 8), groupCount: buf.readUInt16LE(s + 12) })
  }
  return supers
}

/** Parses the group table given the header and a buffer holding bytes [0, recordsStart). */
export function parseBlockMapV3Groups(header: BlockMapV3Header, buf: Buffer): Array<BlockMapV3Group> {
  const start = groupTableStart(header)
  const end = recordsStart(header)
  if (buf.length < end) {
    throw new Error("block map v3: truncated group table")
  }
  const groups: Array<BlockMapV3Group> = []
  for (let g = start; g < end; g += GROUP_SIZE) {
    groups.push({ hash: hex8(buf, g), byteLength: buf.readUInt32LE(g + 8), blockCount: buf.readUInt16LE(g + 12) })
  }
  return groups
}

/** Parses `count` records starting at byte `offset` of `buf` (a slice of the records table). */
export function parseBlockMapV3Records(buf: Buffer, offset: number, count: number): Array<BlockMapV3Record> {
  if (buf.length < offset + count * RECORD_SIZE) {
    throw new Error("block map v3: truncated records")
  }
  const records: Array<BlockMapV3Record> = []
  for (let i = 0, r = offset; i < count; i++, r += RECORD_SIZE) {
    records.push({ hash: hex8(buf, r), size: buf.readUInt16LE(r + HASH_LEN) })
  }
  return records
}

/** Byte ranges [start, end) of every super-group's group entries within the file (cumulative, O(n)). */
export function groupEntryRanges(header: BlockMapV3Header, supers: Array<BlockMapV3Super>): Array<IndexRange> {
  const result: Array<IndexRange> = []
  let start = groupTableStart(header)
  for (const sup of supers) {
    const end = start + sup.groupCount * GROUP_SIZE
    result.push({ start, end })
    start = end
  }
  return result
}

/** Byte ranges [start, end) of every group's records within the file (cumulative, O(n)). */
export function recordRanges(header: BlockMapV3Header, groups: Array<BlockMapV3Group>): Array<IndexRange> {
  const result: Array<IndexRange> = []
  let start = recordsStart(header)
  for (const group of groups) {
    const end = start + group.blockCount * RECORD_SIZE
    result.push({ start, end })
    start = end
  }
  return result
}

/** Byte range [start, end) of a group's records within the file. */
export function recordRangeOfGroup(header: BlockMapV3Header, groups: Array<BlockMapV3Group>, index: number): IndexRange {
  return recordRanges(header, groups)[index]
}

/** Parses a complete v3 buffer. */
export function decodeBlockMapV3(buf: Buffer): BlockMapV3 {
  const header = parseBlockMapV3Header(buf)
  const supers = parseBlockMapV3Supers(header, buf)
  const groups = parseBlockMapV3Groups(header, buf)
  const records = parseBlockMapV3Records(buf, recordsStart(header), header.blockCount)
  let groupsCounted = 0
  let blocksCounted = 0
  for (const sup of supers) {
    if (sup.groupCount === 0) {
      throw new Error("block map v3: empty super-group")
    }
    groupsCounted += sup.groupCount
    blocksCounted += sup.blockCount
  }
  if (groupsCounted !== header.groupCount || blocksCounted !== header.blockCount) {
    throw new Error("block map v3: super-group counts do not sum to groupCount/blockCount")
  }
  let counted = 0
  for (const group of groups) {
    if (group.blockCount === 0) {
      throw new Error("block map v3: empty group")
    }
    counted += group.blockCount
  }
  if (counted !== header.blockCount) {
    throw new Error("block map v3: group block counts do not sum to blockCount")
  }
  if (records.some(record => record.size === 0)) {
    throw new Error("block map v3: empty block")
  }
  return { header, supers, groups, records }
}

/**
 * Converts a v3 map to the v2 `BlockMap` shape consumed by `computeOperations`. Checksums are the
 * 16-char hex block hashes (any unique string works for the planner; sizes drive the offsets).
 */
export function toBlockMap(map: BlockMapV3): BlockMap {
  return {
    version: "2",
    files: [{ name: "file", offset: 0, checksums: map.records.map(record => record.hash), sizes: map.records.map(record => record.size) }],
  }
}
