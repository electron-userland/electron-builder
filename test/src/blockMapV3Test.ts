import { blake2b } from "@noble/hashes/blake2.js"
import {
  BlockInput,
  decodeBlockMapV3,
  encodeBlockMapV3,
  GROUP_MAX,
  GROUP_MIN,
  GROUP_SIZE,
  groupBlocks,
  groupEntryRanges,
  groupSupers,
  HEADER_FIXED_SIZE,
  parseBlockMapV3Groups,
  parseBlockMapV3Header,
  parseBlockMapV3Records,
  parseBlockMapV3Supers,
  RECORD_SIZE,
  recordRangeOfGroup,
  recordsStart,
  REGION_SIZE,
  SUPER_MAX,
  SUPER_MIN,
  SUPER_SIZE,
  superHashOfGroups,
  toBlockMap,
} from "builder-util-runtime/internal"

// Deterministic synthetic blocks: content-derived digests, sizes around a mean.
function makeBlocks(count: number, seed: number, avgSize = 4096, startOffset = 0): Array<BlockInput> {
  const blocks: Array<BlockInput> = []
  let x = seed >>> 0
  let offset = startOffset
  for (let i = 0; i < count; i++) {
    x = (x * 1664525 + 1013904223) >>> 0
    const size = Math.max(64, Math.min(0xffff, avgSize + ((x % (avgSize * 2)) - avgSize) / 2))
    const digest = blake2b(Buffer.from(`block-${seed}-${i}-${x}`), { dkLen: 18 })
    blocks.push({ digest, size: Math.floor(size), offset })
    offset += Math.floor(size)
  }
  return blocks
}

const DEFAULT = { min: 8192, avg: 16384, max: 32768 }

describe("block map v3 format", () => {
  test("encode → decode round-trips header, groups and records", ({ expect }) => {
    const blocks = makeBlocks(1000, 42)
    const fileSize = blocks.reduce((sum, b) => sum + b.size, 0)
    const region = { offset: blocks[300].offset, size: blocks[700].offset - blocks[300].offset, min: 1024, avg: 2048, max: 4096 }
    const buf = encodeBlockMapV3(blocks, { fileSize, defaultChunker: DEFAULT, regions: [region] })
    const map = decodeBlockMapV3(buf)

    expect(map.header.fileSize).toBe(fileSize)
    expect(map.header.blockCount).toBe(1000)
    expect(map.header.groupCount).toBe(map.groups.length)
    expect(map.header.superCount).toBe(map.supers.length)
    expect(map.header.headerLen).toBe(HEADER_FIXED_SIZE + REGION_SIZE)
    expect(map.header.defaultChunker).toEqual(DEFAULT)
    expect(map.header.regions).toEqual([region])
    expect(buf.length).toBe(map.header.headerLen + map.supers.length * SUPER_SIZE + map.groups.length * GROUP_SIZE + 1000 * RECORD_SIZE)
    expect(map.records.map(r => r.size)).toEqual(blocks.map(b => b.size))
    expect(map.records[0].hash).toBe(Buffer.from(blocks[0].digest.subarray(0, 8)).toString("hex"))
    expect(map.groups.reduce((sum, g) => sum + g.byteLength, 0)).toBe(fileSize)
    expect(map.groups.reduce((sum, g) => sum + g.blockCount, 0)).toBe(1000)
    expect(map.supers.reduce((sum, s) => sum + s.groupCount, 0)).toBe(map.groups.length)
    expect(map.supers.reduce((sum, s) => sum + s.blockCount, 0)).toBe(1000)
    // every super hash is the hash of its group entries
    const entryRanges = groupEntryRanges(map.header, map.supers)
    map.supers.forEach((sup, i) => expect(superHashOfGroups(buf.subarray(entryRanges[i].start, entryRanges[i].end))).toBe(sup.hash))
  })

  test("groups are content-defined and bounded", ({ expect }) => {
    const blocks = makeBlocks(5000, 7)
    const groups = groupBlocks(blocks)
    for (const g of groups.slice(0, -1)) {
      expect(g.end - g.start).toBeGreaterThanOrEqual(GROUP_MIN)
      expect(g.end - g.start).toBeLessThanOrEqual(GROUP_MAX)
    }
    const avg = 5000 / groups.length
    expect(avg).toBeGreaterThan(15)
    expect(avg).toBeLessThan(70)
  })

  test("super-groups are content-defined on the group hashes and bounded", ({ expect }) => {
    const blocks = makeBlocks(20000, 8)
    const map = decodeBlockMapV3(encodeBlockMapV3(blocks, { fileSize: blocks.reduce((s, b) => s + b.size, 0), defaultChunker: DEFAULT }))
    for (const sup of map.supers.slice(0, -1)) {
      expect(sup.groupCount).toBeGreaterThanOrEqual(SUPER_MIN)
      expect(sup.groupCount).toBeLessThanOrEqual(SUPER_MAX)
    }
    const avg = map.groups.length / map.supers.length
    expect(avg).toBeGreaterThan(8)
    expect(avg).toBeLessThan(35)
    // the same grouping again from the group hashes alone
    const hashes = map.groups.map(g => Buffer.from(g.hash, "hex"))
    const starts: Array<number> = []
    let offset = 0
    let blockIndex = 0
    for (const g of map.groups) {
      starts.push(offset)
      for (let i = 0; i < g.blockCount; i++, blockIndex++) {
        offset += blocks[blockIndex].size
      }
    }
    expect(groupSupers(hashes, starts).map(s => s.end - s.start)).toEqual(map.supers.map(s => s.groupCount))
  })

  test("an unchanged run of blocks yields identical groups after an insertion earlier in the file", ({ expect }) => {
    const base = makeBlocks(2000, 99)
    const fileSize = (b: Array<BlockInput>) => b.reduce((s, x) => s + x.size, 0)
    const inserted = [...base.slice(0, 500), ...makeBlocks(3, 1234, 4096, base[500].offset), ...base.slice(500)]
    // re-derive offsets after the insertion so region/offset bookkeeping stays consistent
    let off = 0
    for (const b of inserted) {
      b.offset = off
      off += b.size
    }
    const a = decodeBlockMapV3(encodeBlockMapV3(base, { fileSize: fileSize(base), defaultChunker: DEFAULT }))
    const b = decodeBlockMapV3(encodeBlockMapV3(inserted, { fileSize: fileSize(inserted), defaultChunker: DEFAULT }))
    const hashesA = new Set(a.groups.map(g => g.hash))
    const matched = b.groups.filter(g => hashesA.has(g.hash)).length
    // everything except the few groups around the insertion point must still match by hash
    expect(b.groups.length - matched).toBeLessThanOrEqual(4)
    expect(matched).toBeGreaterThan(b.groups.length * 0.9)
    // and the same holds one level up: only the super-group(s) around the insertion change
    const superHashesA = new Set(a.supers.map(s => s.hash))
    const matchedSupers = b.supers.filter(s => superHashesA.has(s.hash)).length
    expect(b.supers.length - matchedSupers).toBeLessThanOrEqual(3)
    expect(matchedSupers).toBeGreaterThan(b.supers.length * 0.7)
  })

  test("region edges force group boundaries", ({ expect }) => {
    const blocks = makeBlocks(600, 5)
    const edge = blocks[250].offset
    const region = { offset: edge, size: blocks[400].offset - edge, min: 1024, avg: 2048, max: 4096 }
    const groups = groupBlocks(blocks, new Set([region.offset, region.offset + region.size]))
    expect(groups.some(g => g.start === 250)).toBe(true)
    expect(groups.some(g => g.start === 400)).toBe(true)
    // and super-group boundaries: a super-group never spans a region edge
    const map = decodeBlockMapV3(encodeBlockMapV3(blocks, { fileSize: blocks.reduce((s, b) => s + b.size, 0), defaultChunker: DEFAULT, regions: [region] }))
    let blockIndex = 0
    const superStarts = new Set<number>()
    for (const sup of map.supers) {
      superStarts.add(blockIndex)
      blockIndex += sup.blockCount
    }
    expect(superStarts.has(250)).toBe(true)
    expect(superStarts.has(400)).toBe(true)
  })

  test("partial parsing: header, group table, then records by group range", ({ expect }) => {
    const blocks = makeBlocks(800, 11)
    const buf = encodeBlockMapV3(blocks, { fileSize: blocks.reduce((s, b) => s + b.size, 0), defaultChunker: DEFAULT })
    const header = parseBlockMapV3Header(buf.subarray(0, HEADER_FIXED_SIZE))
    const supers = parseBlockMapV3Supers(header, buf.subarray(0, header.headerLen + header.superCount * SUPER_SIZE))
    const groups = parseBlockMapV3Groups(header, buf.subarray(0, recordsStart(header)))
    const full = decodeBlockMapV3(buf)
    expect(supers).toEqual(full.supers)
    expect(groups).toEqual(full.groups)
    const range = recordRangeOfGroup(header, groups, 3)
    const slice = buf.subarray(range.start, range.end)
    const records = parseBlockMapV3Records(slice, 0, groups[3].blockCount)
    const blocksBefore = groups.slice(0, 3).reduce((s, g) => s + g.blockCount, 0)
    expect(records).toEqual(full.records.slice(blocksBefore, blocksBefore + groups[3].blockCount))
  })

  test("toBlockMap produces the v2 shape the planner consumes", ({ expect }) => {
    const blocks = makeBlocks(50, 3)
    const map = decodeBlockMapV3(encodeBlockMapV3(blocks, { fileSize: blocks.reduce((s, b) => s + b.size, 0), defaultChunker: DEFAULT }))
    const v2 = toBlockMap(map)
    expect(v2.files).toHaveLength(1)
    expect(v2.files[0].sizes).toEqual(blocks.map(b => b.size))
    expect(new Set(v2.files[0].checksums).size).toBe(50)
  })

  test("rejects bad magic, oversize blocks and truncated input", ({ expect }) => {
    const blocks = makeBlocks(20, 1)
    const buf = encodeBlockMapV3(blocks, { fileSize: blocks.reduce((s, b) => s + b.size, 0), defaultChunker: DEFAULT })
    const bad = Buffer.from(buf)
    bad.write("NOPE", 0, 4, "latin1")
    expect(() => decodeBlockMapV3(bad)).toThrow("bad magic")
    expect(() => decodeBlockMapV3(buf.subarray(0, buf.length - 5))).toThrow("truncated")
    expect(() => encodeBlockMapV3([{ digest: blocks[0].digest, size: 70000, offset: 0 }], { fileSize: 70000, defaultChunker: DEFAULT })).toThrow("16-bit")
  })

  test("rejects counts that cannot fit the file: more blocks than bytes, more groups than blocks, more super-groups than groups", ({ expect }) => {
    const blocks = makeBlocks(20, 1)
    const buf = encodeBlockMapV3(blocks, { fileSize: blocks.reduce((s, b) => s + b.size, 0), defaultChunker: DEFAULT })
    const header = parseBlockMapV3Header(buf)
    const withCount = (offset: number, value: number) => {
      const result = Buffer.from(buf)
      result.writeUInt32LE(value, offset)
      return result
    }
    // blockCount @20, groupCount @16, superCount @42
    expect(() => parseBlockMapV3Header(withCount(20, header.fileSize + 1))).toThrow("inconsistent counts")
    expect(() => parseBlockMapV3Header(withCount(16, header.blockCount + 1))).toThrow("inconsistent counts")
    expect(() => parseBlockMapV3Header(withCount(42, header.groupCount + 1))).toThrow("inconsistent counts")
  })

  test("rejects an empty map: a 0-byte file, or a file without blocks", ({ expect }) => {
    expect(() => decodeBlockMapV3(encodeBlockMapV3([], { fileSize: 0, defaultChunker: DEFAULT }))).toThrow("empty map (fileSize 0, blocks 0)")
    expect(() => decodeBlockMapV3(encodeBlockMapV3([], { fileSize: 4096, defaultChunker: DEFAULT }))).toThrow("empty map (fileSize 4096, blocks 0)")
  })

  test("rejects regions that are empty or extend past the file", ({ expect }) => {
    const blocks = makeBlocks(20, 1)
    const fileSize = blocks.reduce((s, b) => s + b.size, 0)
    const encodeWith = (region: { offset: number; size: number }) =>
      encodeBlockMapV3(blocks, { fileSize, defaultChunker: DEFAULT, regions: [{ ...region, min: 512, avg: 1024, max: 2048 }] })
    expect(() => parseBlockMapV3Header(encodeWith({ offset: blocks[5].offset, size: 0 }))).toThrow(/region 0 .* is empty or extends past/)
    expect(() => parseBlockMapV3Header(encodeWith({ offset: blocks[5].offset, size: fileSize }))).toThrow(/region 0 .* is empty or extends past/)
    expect(parseBlockMapV3Header(encodeWith({ offset: blocks[5].offset, size: fileSize - blocks[5].offset })).regions).toHaveLength(1)
  })

  test("rejects blocks that do not cover the file size", ({ expect }) => {
    const blocks = makeBlocks(20, 1)
    const fileSize = blocks.reduce((s, b) => s + b.size, 0)
    expect(() => decodeBlockMapV3(encodeBlockMapV3(blocks, { fileSize: fileSize + 1, defaultChunker: DEFAULT }))).toThrow(
      `blocks cover ${fileSize} bytes, file size is ${fileSize + 1}`
    )
  })

  test("rejects a header that declares a map larger than the limit before parsing its tables", ({ expect }) => {
    const blocks = makeBlocks(20, 1)
    const buf = encodeBlockMapV3(blocks, { fileSize: blocks.reduce((s, b) => s + b.size, 0), defaultChunker: DEFAULT })
    expect(decodeBlockMapV3(buf, buf.length).records).toHaveLength(20)
    expect(() => decodeBlockMapV3(buf, buf.length - 1)).toThrow(`the header declares a ${buf.length}-byte map, more than the ${buf.length - 1}-byte limit`)
    // only the header is in hand: the declared size is checked before the (missing) tables are read
    expect(() => decodeBlockMapV3(buf.subarray(0, HEADER_FIXED_SIZE), 100)).toThrow("more than the 100-byte limit")
  })
})
