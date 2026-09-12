import { createHash } from "crypto"
import { createReadStream } from "fs"
import { open, stat } from "fs/promises"

/** Bytes of the needle used as the cheap scan probe; a full hash comparison confirms every probe hit. */
const PROBE_SIZE = 64 * 1024
/** Haystack read granularity. Peak memory ≈ READ_CHUNK_SIZE + PROBE_SIZE, independent of file sizes. */
const READ_CHUNK_SIZE = 1024 * 1024

export interface VerbatimRange {
  offset: number
  size: number
}

async function hashRange(file: string, start: number, size: number): Promise<string> {
  const hash = createHash("sha256")
  await new Promise<void>((resolve, reject) => {
    createReadStream(file, { start, end: start + size - 1 })
      .on("data", chunk => hash.update(chunk))
      .on("end", resolve)
      .on("error", reject)
  })
  return hash.digest("hex")
}

/**
 * Finds the first byte range of `haystackFile` whose contents are exactly the contents of `needleFile`
 * (e.g. the location of an archive member stored with `Copy` inside an installer that embeds the archive).
 *
 * Streams the haystack in `READ_CHUNK_SIZE` reads (never loads it whole), scanning for the first
 * `min(PROBE_SIZE, needle size)` bytes of the needle — with a `probe.length - 1` byte overlap between
 * reads so a probe straddling a chunk boundary is still seen — and confirms each probe hit by hashing the
 * candidate haystack range against the needle's hash. False-positive probe hits are skipped and the scan
 * continues; the first confirmed match is returned.
 *
 * @returns the confirmed range, or `null` when the needle does not occur verbatim (including when it is
 *   larger than the haystack).
 * @throws when the needle is empty — an empty range is meaningless as a blockmap region.
 */
export async function findVerbatimRange(haystackFile: string, needleFile: string): Promise<VerbatimRange | null> {
  const needleSize = (await stat(needleFile)).size
  if (needleSize === 0) {
    throw new Error(`Cannot locate an empty file (${needleFile}) inside ${haystackFile}`)
  }
  const haystackSize = (await stat(haystackFile)).size
  if (needleSize > haystackSize) {
    return null
  }

  const probeSize = Math.min(PROBE_SIZE, needleSize)
  const probe = Buffer.allocUnsafe(probeSize)
  const needleHandle = await open(needleFile, "r")
  try {
    const { bytesRead } = await needleHandle.read(probe, 0, probeSize, 0)
    if (bytesRead !== probeSize) {
      throw new Error(`Short read of ${needleFile}: expected ${probeSize} bytes, got ${bytesRead}`)
    }
  } finally {
    await needleHandle.close()
  }
  const needleHash = await hashRange(needleFile, 0, needleSize)

  const haystackHandle = await open(haystackFile, "r")
  try {
    const readBuffer = Buffer.allocUnsafe(READ_CHUNK_SIZE)
    // `carry` holds the last `probe.length - 1` bytes of the previous window so a probe occurrence that
    // straddles two reads is found; a probe can never fit entirely inside the carry, so no hit is reported twice.
    let carry: Buffer = Buffer.alloc(0)
    // Absolute haystack offset of window[0].
    let windowOffset = 0
    let readPosition = 0
    while (readPosition < haystackSize) {
      const { bytesRead } = await haystackHandle.read(readBuffer, 0, READ_CHUNK_SIZE, readPosition)
      if (bytesRead === 0) {
        break
      }
      readPosition += bytesRead
      const window = carry.length === 0 ? readBuffer.subarray(0, bytesRead) : Buffer.concat([carry, readBuffer.subarray(0, bytesRead)])

      let searchFrom = 0
      while (searchFrom <= window.length - probeSize) {
        const index = window.indexOf(probe, searchFrom)
        if (index === -1) {
          break
        }
        const offset = windowOffset + index
        if (offset + needleSize > haystackSize) {
          // no later candidate can fit either
          return null
        }
        if ((await hashRange(haystackFile, offset, needleSize)) === needleHash) {
          return { offset, size: needleSize }
        }
        searchFrom = index + 1
      }

      const carrySize = Math.min(probeSize - 1, window.length)
      // copy: `window` may alias `readBuffer`, which the next read overwrites
      carry = Buffer.from(window.subarray(window.length - carrySize))
      windowOffset += window.length - carrySize
    }
  } finally {
    await haystackHandle.close()
  }
  return null
}
