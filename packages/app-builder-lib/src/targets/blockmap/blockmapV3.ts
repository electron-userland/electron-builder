import { createHash } from "crypto"
import { writeFile } from "fs/promises"
import { blake2b } from "@noble/hashes/blake2.js"
import { BlockInput, BlockMapV3Region, encodeBlockMapV3, parseBlockMapV3Header } from "builder-util-runtime/internal"
import { BlockMapRegion, chunkFile, DEFAULT_CHUNKER } from "./blockmap.js"

export interface BuildBlockMapV3Options {
  /**
   * Byte ranges of the input chunked with their own parameters; same semantics as
   * `BuildBlockMapOptions.regions` (ascending, non-overlapping, forced block boundaries at both edges).
   * Every region is also recorded in the v3 header and forces a group boundary at both edges.
   */
  regions?: Array<BlockMapRegion> | null

  /**
   * Forced block boundaries in addition to the content-defined ones; same semantics as
   * `BuildBlockMapOptions.boundaries`. They cut blocks only — groups are still closed content-defined
   * (and at region edges), so a few thousand boundaries do not inflate the group table an updater
   * fetches on every update.
   */
  boundaries?: Array<number> | null
}

export interface BuildBlockMapV3Result {
  /** input size in bytes (the `fileSize` recorded in the header) */
  size: number
  /** base64 SHA-512 of the input, hashed in the same pass as the chunking (what update info records for the artifact) */
  sha512: string
  groupCount: number
  blockCount: number
}

// A v3 record stores the block size in 16 bits.
const MAX_V3_BLOCK_SIZE = 0xffff

/**
 * Builds the v3 block map (the `blockmap: "v2"` format, see `builder-util-runtime/blockMapV3`) of `inFile`
 * and writes it to `outFile`.
 *
 * The blocks come from the same region-aware Rabin chunker as the v2 map (`chunkFile`): the default
 * 8/16/32 KiB chunker outside every region, a region's own chunker inside it, and a forced boundary at
 * every region edge and at every `boundaries` offset — only the chunker parameters and the forced cuts
 * differ from a v2 build, never the chunking algorithm.
 * The block digests are the same blake2b-18 hashes v2 base64-encodes (v3 keeps their first 8 bytes).
 */
export async function buildBlockMapV3(inFile: string, outFile: string, options: BuildBlockMapV3Options = {}): Promise<BuildBlockMapV3Result> {
  const regions = options.regions ?? []
  for (let i = 0; i < regions.length; i++) {
    const max = regions[i]?.chunker?.max
    if (typeof max === "number" && max > MAX_V3_BLOCK_SIZE) {
      throw new Error(`blockmap region #${i}: chunker.max must not exceed ${MAX_V3_BLOCK_SIZE} for a v3 block map, got ${max}`)
    }
  }

  const blocks: Array<BlockInput> = []
  const fileHash = createHash("sha512")
  const fileSize = await chunkFile(
    inFile,
    { regions, boundaries: options.boundaries },
    (chunk, offset) => {
      blocks.push({ digest: blake2b(chunk, { dkLen: 18 }), size: chunk.length, offset })
    },
    data => fileHash.update(data)
  )

  const v3Regions: Array<BlockMapV3Region> = regions.map(region => ({
    offset: region.offset,
    size: region.size,
    min: region.chunker.min,
    avg: region.chunker.avg,
    max: region.chunker.max,
  }))
  const encoded = encodeBlockMapV3(blocks, { fileSize, defaultChunker: DEFAULT_CHUNKER, regions: v3Regions })
  await writeFile(outFile, encoded)
  return { size: fileSize, sha512: fileHash.digest("base64"), groupCount: parseBlockMapV3Header(encoded).groupCount, blockCount: blocks.length }
}
