import { archive } from "app-builder-lib/src/targets/archive"
import { locateStoredMemberRegions, STORED_MEMBER_CHUNKER } from "app-builder-lib/src/targets/differentialUpdateInfoBuilder"
import { findVerbatimRange } from "app-builder-lib/src/targets/blockmap/verbatimRange"
import * as fs from "fs/promises"
import * as path from "path"
import { describe } from "vitest"
import { listArchiveEntryMethods } from "./helpers/archiveHelper"

const KiB = 1024
const MiB = 1024 * KiB
// findVerbatimRange scans the first 64 KiB of the needle; a needle longer than that has a tail the
// probe does not cover, which is what makes a probe hit a mere candidate.
const PROBE_SIZE = 64 * KiB

// Deterministic pseudo-random bytes (LCG) so no probe-sized run ever repeats by accident.
function pseudoRandom(size: number, seed: number): Buffer {
  const buf = Buffer.allocUnsafe(size)
  let x = seed >>> 0
  for (let i = 0; i < size; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    buf[i] = x >>> 24
  }
  return buf
}

// Writes `haystack` and `needle` next to each other and returns their paths.
async function writePair(dir: string, haystack: Buffer, needle: Buffer): Promise<{ haystackFile: string; needleFile: string }> {
  const haystackFile = path.join(dir, "haystack.bin")
  const needleFile = path.join(dir, "needle.bin")
  await fs.writeFile(haystackFile, haystack)
  await fs.writeFile(needleFile, needle)
  return { haystackFile, needleFile }
}

// A haystack of `size` bytes of filler with `needle` pasted in at `offset`.
function plant(size: number, needle: Buffer, offset: number, fillerSeed = 7): Buffer {
  const haystack = pseudoRandom(size, fillerSeed)
  needle.copy(haystack, offset)
  return haystack
}

describe("findVerbatimRange", () => {
  const needle = pseudoRandom(100 * KiB, 42)

  test("needle at offset 0", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const files = await writePair(dir, plant(300 * KiB, needle, 0), needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toEqual({ offset: 0, size: needle.length })
  })

  test("needle mid-file", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const offset = 123_457
    const files = await writePair(dir, plant(300 * KiB, needle, offset), needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toEqual({ offset, size: needle.length })
  })

  test("needle at the very end", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const size = 300 * KiB
    const offset = size - needle.length
    const files = await writePair(dir, plant(size, needle, offset), needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toEqual({ offset, size: needle.length })
  })

  // The haystack is read in chunks; a needle whose probe straddles a chunk edge must still be found.
  // Boundaries at several power-of-two multiples cover any chunk size the implementation picks.
  for (const boundary of [256 * KiB, 512 * KiB, 1 * MiB, 2 * MiB]) {
    test(`needle straddling the ${boundary / KiB} KiB read boundary`, async ({ expect, tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const offset = boundary - 1000
      const files = await writePair(dir, plant(3 * MiB, needle, offset), needle)
      expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toEqual({ offset, size: needle.length })
    })
  }

  test("needle smaller than the probe straddling a read boundary", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const smallNeedle = pseudoRandom(300, 99)
    const offset = 1 * MiB - 100
    const files = await writePair(dir, plant(2 * MiB, smallNeedle, offset), smallNeedle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toEqual({ offset, size: smallNeedle.length })
  })

  // The probe (first 64 KiB of the needle) also occurs earlier with a different tail: that candidate
  // must be rejected by the full comparison and the scan must go on to the real occurrence.
  test("skips a false-positive probe hit and returns the real match", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const decoyOffset = 10 * KiB
    const realOffset = 700 * KiB
    const haystack = plant(1 * MiB, needle, realOffset)
    needle.subarray(0, PROBE_SIZE).copy(haystack, decoyOffset)
    // decoy tail differs from the needle's tail
    haystack[decoyOffset + PROBE_SIZE] = needle[PROBE_SIZE] ^ 0xff
    const files = await writePair(dir, haystack, needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toEqual({ offset: realOffset, size: needle.length })
  })

  test("false-positive probe hit with no real match returns null", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const haystack = pseudoRandom(512 * KiB, 3)
    needle.subarray(0, PROBE_SIZE).copy(haystack, 200 * KiB)
    const files = await writePair(dir, haystack, needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toBeNull()
  })

  test("not found", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const files = await writePair(dir, pseudoRandom(512 * KiB, 3), needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toBeNull()
  })

  test("needle larger than haystack returns null", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const files = await writePair(dir, needle.subarray(0, needle.length - 1), needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toBeNull()
  })

  test("needle equal to haystack", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const files = await writePair(dir, needle, needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toEqual({ offset: 0, size: needle.length })
  })

  test("a probe hit too close to the end to fit the needle is not a match", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    // haystack ends with the first 80 KiB of the needle — the probe matches but the needle can't fit
    const haystack = Buffer.concat([pseudoRandom(200 * KiB, 5), needle.subarray(0, 80 * KiB)])
    const files = await writePair(dir, haystack, needle)
    expect(await findVerbatimRange(files.haystackFile, files.needleFile)).toBeNull()
  })

  test("empty needle throws", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const files = await writePair(dir, pseudoRandom(4 * KiB, 1), Buffer.alloc(0))
    await expect(findVerbatimRange(files.haystackFile, files.needleFile)).rejects.toThrow("empty")
  })
})

// The production use: an app package built with `storedPaths` keeps the asar as a verbatim Copy
// member, and the region handed to the block map must be exactly those bytes.
describe("locateStoredMemberRegions", () => {
  async function makeAppDir(root: string, asar: Buffer): Promise<string> {
    const dir = path.join(root, "app")
    await fs.mkdir(path.join(dir, "resources"), { recursive: true })
    await fs.writeFile(path.join(dir, "app.txt"), "compressible ".repeat(2000))
    await fs.writeFile(path.join(dir, "resources", "app.asar"), asar)
    return dir
  }

  test("locates the stored asar in a 7z produced by archive() with storedPaths", async ({ expect, tmpDir }) => {
    const root = await tmpDir.createTempDir()
    const asarBytes = pseudoRandom(200 * KiB, 2024)
    const dir = await makeAppDir(root, asarBytes)
    const outFile = path.join(root, "stored.7z")
    await archive("7z", outFile, dir, { withoutDir: true, solid: false, storedPaths: ["resources/app.asar"] })
    expect((await listArchiveEntryMethods(outFile)).get("resources/app.asar")).toBe("Copy")

    const asarFile = path.join(dir, "resources", "app.asar")
    const regions = await locateStoredMemberRegions(outFile, [asarFile])
    expect(regions).toHaveLength(1)
    const [{ offset, size, chunker }] = regions
    expect(size).toBe(asarBytes.length)
    expect(chunker).toBe(STORED_MEMBER_CHUNKER)
    const archiveBytes = await fs.readFile(outFile)
    expect(archiveBytes.subarray(offset, offset + size).equals(asarBytes)).toBe(true)
  })

  // Several arch packages are embedded in one universal installer; the regions of all their stored
  // members must come back ascending, each covering its own member's bytes.
  test("returns one region per member, sorted by offset", async ({ expect, tmpDir }) => {
    const root = await tmpDir.createTempDir()
    const first = pseudoRandom(70 * KiB, 11)
    const second = pseudoRandom(90 * KiB, 12)
    const firstFile = path.join(root, "first.asar")
    const secondFile = path.join(root, "second.asar")
    await fs.writeFile(firstFile, first)
    await fs.writeFile(secondFile, second)
    // installer-like container: filler, second member, filler, first member, filler
    const container = Buffer.concat([pseudoRandom(50 * KiB, 1), second, pseudoRandom(30 * KiB, 2), first, pseudoRandom(20 * KiB, 3)])
    const containerFile = path.join(root, "installer.bin")
    await fs.writeFile(containerFile, container)

    const regions = await locateStoredMemberRegions(containerFile, [firstFile, secondFile])
    expect(regions.map(it => ({ offset: it.offset, size: it.size }))).toEqual([
      { offset: 50 * KiB, size: second.length },
      { offset: 50 * KiB + second.length + 30 * KiB, size: first.length },
    ])
  })

  test("a member not found verbatim is skipped without failing", async ({ expect, tmpDir }) => {
    const root = await tmpDir.createTempDir()
    const present = pseudoRandom(70 * KiB, 21)
    const missing = pseudoRandom(70 * KiB, 22)
    const presentFile = path.join(root, "present.asar")
    const missingFile = path.join(root, "missing.asar")
    await fs.writeFile(presentFile, present)
    await fs.writeFile(missingFile, missing)
    const containerFile = path.join(root, "installer.bin")
    await fs.writeFile(containerFile, Buffer.concat([pseudoRandom(10 * KiB, 1), present]))

    const regions = await locateStoredMemberRegions(containerFile, [missingFile, presentFile])
    expect(regions).toEqual([{ offset: 10 * KiB, size: present.length, chunker: STORED_MEMBER_CHUNKER }])
  })

  test("no members yields no regions", async ({ expect, tmpDir }) => {
    const root = await tmpDir.createTempDir()
    const containerFile = path.join(root, "installer.bin")
    await fs.writeFile(containerFile, pseudoRandom(10 * KiB, 1))
    expect(await locateStoredMemberRegions(containerFile, [])).toEqual([])
  })
})
